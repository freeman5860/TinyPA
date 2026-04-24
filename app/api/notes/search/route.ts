import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, items } from "@/lib/db";
import { embedQuery } from "@/lib/llm/embedding";
import { and, eq, ilike, desc, sql } from "drizzle-orm";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

type Hit = {
  id: string;
  content: string;
  tags: string[];
  createdAt: string;
  matchedBy: "keyword" | "vector";
  score: number;
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const limit = Math.min(
    Math.max(Number(req.nextUrl.searchParams.get("limit") ?? 20), 1),
    50
  );
  if (!q) return NextResponse.json({ items: [], q: "" });

  const userId = session.user.id;

  const keywordPromise = db
    .select({
      id: items.id,
      content: items.content,
      tags: items.tags,
      createdAt: items.createdAt,
    })
    .from(items)
    .where(
      and(
        eq(items.userId, userId),
        eq(items.type, "note"),
        ilike(items.content, `%${q}%`)
      )
    )
    .orderBy(desc(items.createdAt))
    .limit(limit);

  const vectorPromise = (async () => {
    let qVec: number[];
    try {
      const [v] = await embedQuery(q);
      qVec = v;
    } catch (err) {
      console.error("[notes.search] embed query failed", err);
      return [] as {
        id: string;
        content: string;
        tags: string[];
        createdAt: Date;
        dist: number;
      }[];
    }
    if (!qVec || qVec.length === 0) return [];
    const vecLit = `[${qVec.join(",")}]`;
    const rows = await db
      .select({
        id: items.id,
        content: items.content,
        tags: items.tags,
        createdAt: items.createdAt,
        dist: sql<number>`${items.embedding} <=> ${vecLit}::vector`,
      })
      .from(items)
      .where(
        and(
          eq(items.userId, userId),
          eq(items.type, "note"),
          sql`${items.embedding} IS NOT NULL`
        )
      )
      .orderBy(sql`${items.embedding} <=> ${vecLit}::vector`)
      .limit(limit);
    return rows;
  })();

  const [kwRows, vecRows] = await Promise.all([keywordPromise, vectorPromise]);

  const seen = new Set<string>();
  const hits: Hit[] = [];
  for (const r of kwRows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    hits.push({
      id: r.id,
      content: r.content,
      tags: (r.tags ?? []) as string[],
      createdAt: r.createdAt.toISOString(),
      matchedBy: "keyword",
      score: 1,
    });
  }
  for (const r of vecRows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    hits.push({
      id: r.id,
      content: r.content,
      tags: (r.tags ?? []) as string[],
      createdAt: r.createdAt.toISOString(),
      matchedBy: "vector",
      score: 1 - Number(r.dist ?? 1),
    });
  }

  return NextResponse.json({ items: hits.slice(0, limit), q });
}
