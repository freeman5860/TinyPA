import { NextRequest, NextResponse } from "next/server";
import { db, items } from "@/lib/db";
import { getEmbed } from "@/lib/llm/embedding";
import { and, eq, isNull, sql } from "drizzle-orm";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BATCH_SIZE = 16;

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const maxRows = Math.min(
    Math.max(Number(req.nextUrl.searchParams.get("max") ?? 200), 1),
    2000
  );

  const rows = await db
    .select({ id: items.id, content: items.content })
    .from(items)
    .where(and(eq(items.type, "note"), isNull(items.embedding)))
    .limit(maxRows);

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    try {
      const vectors = await getEmbed().embed(batch.map((r) => r.content));
      for (let j = 0; j < batch.length; j++) {
        const vec = vectors[j];
        if (!vec || vec.length === 0) {
          failed++;
          continue;
        }
        await db
          .update(items)
          .set({ embedding: vec })
          .where(eq(items.id, batch[j].id));
        processed++;
      }
    } catch (err) {
      failed += batch.length;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      console.error("[backfill] batch failed", { start: i, err: msg });
    }
  }

  const remaining = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(items)
    .where(and(eq(items.type, "note"), isNull(items.embedding)));

  return NextResponse.json({
    scanned: rows.length,
    processed,
    failed,
    remaining: remaining[0]?.n ?? 0,
    errors: errors.slice(0, 5),
  });
}
