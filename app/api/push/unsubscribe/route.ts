import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, pushSubs } from "@/lib/db";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

const schema = z.object({
  endpoint: z.string().url(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const result = await db
    .delete(pushSubs)
    .where(
      and(
        eq(pushSubs.userId, session.user.id),
        eq(pushSubs.channel, "webpush"),
        sql`${pushSubs.endpoint}->>'endpoint' = ${parsed.data.endpoint}`
      )
    );

  return NextResponse.json({ ok: true, removed: result.count ?? null });
}
