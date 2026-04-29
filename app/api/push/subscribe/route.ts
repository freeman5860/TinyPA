import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, pushSubs } from "@/lib/db";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

const schema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  expirationTime: z.number().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  }

  const sub = parsed.data;

  // Deduplicate by endpoint — same device should upsert, not create a new row.
  const existing = await db
    .select()
    .from(pushSubs)
    .where(
      and(
        eq(pushSubs.userId, session.user.id),
        eq(pushSubs.channel, "webpush"),
        sql`${pushSubs.endpoint}->>'endpoint' = ${sub.endpoint}`
      )
    );

  if (existing.length) {
    await db
      .update(pushSubs)
      .set({ endpoint: sub, enabled: true })
      .where(eq(pushSubs.id, existing[0].id));
    return NextResponse.json({ ok: true, id: existing[0].id, updated: true });
  }

  const [row] = await db
    .insert(pushSubs)
    .values({
      userId: session.user.id,
      channel: "webpush",
      endpoint: sub,
      enabled: true,
    })
    .returning();

  return NextResponse.json({ ok: true, id: row.id, updated: false });
}
