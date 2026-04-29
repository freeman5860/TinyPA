import { NextResponse } from "next/server";
import { and, eq, lt, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import { db, pushSubs, telegramBindTokens } from "@/lib/db";
import { getBotInfo } from "@/lib/push/telegram";

export const dynamic = "force-dynamic";

/**
 * POST /api/telegram/bind → generate a one-time 5-minute token and return
 * the bot username + deep-link URL for the frontend to open.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const bot = await getBotInfo();
  if (!bot) {
    return NextResponse.json(
      { error: "bot_not_configured", hint: "TELEGRAM_BOT_TOKEN missing or invalid" },
      { status: 500 }
    );
  }

  // Clean up expired tokens opportunistically.
  await db.delete(telegramBindTokens).where(lt(telegramBindTokens.expiresAt, new Date())).catch(() => null);

  const token = randomBytes(4).toString("hex"); // 8 hex chars
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await db.insert(telegramBindTokens).values({
    token,
    userId: session.user.id,
    expiresAt,
  });

  return NextResponse.json({
    token,
    botUsername: bot.username,
    deepLink: `https://t.me/${bot.username}?start=${token}`,
    expiresAt: expiresAt.toISOString(),
  });
}

/**
 * GET /api/telegram/bind → current binding status (used by settings page).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(pushSubs)
    .where(and(eq(pushSubs.userId, session.user.id), eq(pushSubs.channel, "telegram")));

  const bindings = rows.map((r) => {
    const ep = r.endpoint as { chat_id?: number; username?: string; first_name?: string };
    return {
      id: r.id,
      chatId: ep.chat_id ?? null,
      username: ep.username ?? null,
      firstName: ep.first_name ?? null,
      enabled: r.enabled,
      createdAt: r.createdAt,
    };
  });

  const bot = await getBotInfo();
  return NextResponse.json({
    bindings,
    botUsername: bot?.username ?? null,
    configured: Boolean(bot),
  });
}

/**
 * DELETE /api/telegram/bind?id=<push_sub id> → unbind a specific chat.
 */
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  await db
    .delete(pushSubs)
    .where(
      and(
        eq(pushSubs.userId, session.user.id),
        eq(pushSubs.channel, "telegram"),
        sql`${pushSubs.id} = ${id}`
      )
    );

  return NextResponse.json({ ok: true });
}
