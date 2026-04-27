import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, messages, items } from "@/lib/db";
import { eq, inArray, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Thin endpoint for chat polling: returns only the message ids you ask for,
// with replyText / processedAt / items. ~1-2 rows per call instead of the
// full 50 that GET /api/messages returns. Used by ChatClient while waiting
// for after() extraction to finish.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw = req.nextUrl.searchParams.get("ids") ?? "";
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20);
  if (!ids.length) return NextResponse.json({ messages: [] });

  const msgRows = await db
    .select({
      id: messages.id,
      replyText: messages.replyText,
      processedAt: messages.processedAt,
    })
    .from(messages)
    .where(and(inArray(messages.id, ids), eq(messages.userId, session.user.id)));

  const ownedIds = msgRows.map((m) => m.id);
  const itemRows = ownedIds.length
    ? await db
        .select({
          id: items.id,
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
        .where(inArray(items.messageId, ownedIds))
    : [];

  const byMsg = new Map<string, typeof itemRows>();
  for (const it of itemRows) {
    if (!it.messageId) continue;
    const arr = byMsg.get(it.messageId) ?? [];
    arr.push(it);
    byMsg.set(it.messageId, arr);
  }

  return NextResponse.json({
    messages: msgRows.map((m) => ({
      id: m.id,
      replyText: m.replyText,
      processedAt: m.processedAt,
      items: byMsg.get(m.id) ?? [],
    })),
  });
}
