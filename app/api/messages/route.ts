import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { db, messages, items, users } from "@/lib/db";
import { extractForMessage } from "@/lib/jobs/extract";
import { safeLimit, userMsgBurstLimit } from "@/lib/ratelimit";
import { checkAndIncrMessageQuota } from "@/lib/quota";
import { and, eq, desc, inArray, lt } from "drizzle-orm";

const QUOTA_REPLY = "今日额度已满，明天见。";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rawLimit = Number(req.nextUrl.searchParams.get("limit") ?? 5);
  const limit = Math.min(Math.max(rawLimit, 1), 100);
  const beforeParam = req.nextUrl.searchParams.get("before");
  const before = beforeParam ? new Date(beforeParam) : null;
  if (beforeParam && (before === null || Number.isNaN(before.getTime()))) {
    return NextResponse.json({ error: "bad_before" }, { status: 400 });
  }

  const msgRows = await db
    .select()
    .from(messages)
    .where(
      before
        ? and(eq(messages.userId, session.user.id), lt(messages.createdAt, before))
        : eq(messages.userId, session.user.id)
    )
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  const ordered = msgRows.reverse();
  const ids = ordered.map((m) => m.id);

  const itemRows = ids.length
    ? await db
        .select({
          id: items.id,
          userId: items.userId,
          messageId: items.messageId,
          type: items.type,
          content: items.content,
          dueAt: items.dueAt,
          priority: items.priority,
          status: items.status,
          tags: items.tags,
          createdAt: items.createdAt,
          completedAt: items.completedAt,
        })
        .from(items)
        .where(inArray(items.messageId, ids))
    : [];

  const byMsg = new Map<string, typeof itemRows>();
  for (const it of itemRows) {
    if (!it.messageId) continue;
    const arr = byMsg.get(it.messageId) ?? [];
    arr.push(it);
    byMsg.set(it.messageId, arr);
  }

  const withItems = ordered.map((m) => ({ ...m, items: byMsg.get(m.id) ?? [] }));
  return NextResponse.json({ messages: withItems, hasMore: msgRows.length >= limit });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: "too_long" }, { status: 400 });

  const userId = session.user.id;

  const burst = await safeLimit(userMsgBurstLimit, userId, "msg-burst");
  if (!burst.allowed) {
    return NextResponse.json(
      { error: "rate_limited", scope: "burst", reset: burst.reset },
      { status: 429 },
    );
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const timezone = user?.timezone ?? "Asia/Shanghai";

  const quota = await checkAndIncrMessageQuota(userId, timezone);
  if (!quota.ok) {
    const [msg] = await db
      .insert(messages)
      .values({
        userId,
        rawText: text,
        replyText: QUOTA_REPLY,
        processedAt: new Date(),
      })
      .returning();
    console.warn("[messages] quota exceeded", { userId, used: quota.used, limit: quota.limit });
    return NextResponse.json({ message: { ...msg, items: [] }, pending: false, quotaExceeded: true });
  }

  const [msg] = await db
    .insert(messages)
    .values({ userId, rawText: text })
    .returning();

  after(async () => {
    const t0 = Date.now();
    let ok = false;
    let count = 0;
    let errMsg: string | null = null;
    try {
      const { items } = await extractForMessage(msg.id, userId, timezone);
      ok = true;
      count = items.length;
    } catch (err) {
      errMsg = err instanceof Error ? err.message : String(err);
    } finally {
      await db
        .update(messages)
        .set({ processedAt: new Date() })
        .where(eq(messages.id, msg.id))
        .catch((e) => console.error("[messages] stamp failed", msg.id, e));
      const ms = Date.now() - t0;
      if (ok) {
        console.log("[messages] extracted", { msgId: msg.id, count, ms });
      } else {
        console.error("[messages] extract failed", { msgId: msg.id, ms, err: errMsg });
      }
    }
  });

  return NextResponse.json({ message: { ...msg, items: [] }, pending: true });
}
