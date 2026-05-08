import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, users, messages, items, digests, pushSubs, telegramBindTokens } from "@/lib/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [userMessages, userItems, userDigests, userPushSubs, userTelegramBinds] = await Promise.all([
    db.select().from(messages).where(eq(messages.userId, userId)),
    db
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
      .where(eq(items.userId, userId)),
    db.select().from(digests).where(eq(digests.userId, userId)),
    db.select().from(pushSubs).where(eq(pushSubs.userId, userId)),
    db.select().from(telegramBindTokens).where(eq(telegramBindTokens.userId, userId)),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      timezone: user.timezone,
      createdAt: user.createdAt,
    },
    messages: userMessages,
    items: userItems,
    digests: userDigests,
    pushSubs: userPushSubs.map((p) => ({ ...p, endpoint: "[redacted]" })),
    telegramBinds: userTelegramBinds.map((t) => ({ ...t, token: "[redacted]" })),
  };

  const filename = `tinypa-export-${user.email.replace(/[^a-z0-9]+/gi, "_")}-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
