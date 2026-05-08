import { NextRequest, NextResponse, after } from "next/server";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, messages, pushSubs, telegramBindTokens, users } from "@/lib/db";
import { sendTelegramMessage, type TelegramEndpoint } from "@/lib/push/telegram";
import { extractForMessage } from "@/lib/jobs/extract";
import * as Sentry from "@sentry/nextjs";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

// Minimal Telegram Update shape — we only look at messages.
type TgUser = { id: number; username?: string; first_name?: string };
type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string };
  text?: string;
};
type TgUpdate = { update_id: number; message?: TgMessage };

export async function POST(req: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const got = req.headers.get("x-telegram-bot-api-secret-token");
  if (!expected || got !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const update = (await req.json().catch(() => null)) as TgUpdate | null;
  if (!update?.message) return NextResponse.json({ ok: true });

  const msg = update.message;
  if (!msg.text || !msg.from) return NextResponse.json({ ok: true });

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  // ----- /start [token] : bind -----
  if (text === "/start" || text.startsWith("/start ")) {
    const token = text === "/start" ? "" : text.slice(7).trim();

    if (!token) {
      await sendTelegramMessage(
        chatId,
        "欢迎使用 TinyPA 助理 🌱\n\n要开始使用，请先到网页版 → 设置 → Telegram 绑定，生成一个一次性 token，然后在这里发 /start <token>。"
      );
      return NextResponse.json({ ok: true });
    }

    const [row] = await db
      .select()
      .from(telegramBindTokens)
      .where(and(eq(telegramBindTokens.token, token), gt(telegramBindTokens.expiresAt, new Date())));

    if (!row) {
      await sendTelegramMessage(chatId, "这个绑定码无效或已过期（5 分钟内有效）。去网页版重新生成一个。");
      return NextResponse.json({ ok: true });
    }

    const endpoint: TelegramEndpoint = {
      chat_id: chatId,
      username: msg.from.username,
      first_name: msg.from.first_name,
    };

    // Upsert: if this chat is already bound to this user, just re-enable.
    const existing = await db
      .select()
      .from(pushSubs)
      .where(
        and(
          eq(pushSubs.userId, row.userId),
          eq(pushSubs.channel, "telegram"),
          sql`(${pushSubs.endpoint}->>'chat_id')::bigint = ${chatId}`
        )
      );

    if (existing.length) {
      await db
        .update(pushSubs)
        .set({ endpoint: endpoint as unknown as Record<string, unknown>, enabled: true })
        .where(eq(pushSubs.id, existing[0].id));
    } else {
      await db.insert(pushSubs).values({
        userId: row.userId,
        channel: "telegram",
        endpoint: endpoint as unknown as Record<string, unknown>,
        enabled: true,
      });
    }

    // Single-use token
    await db.delete(telegramBindTokens).where(eq(telegramBindTokens.token, token));

    await sendTelegramMessage(
      chatId,
      "绑定成功 ✅\n\n接下来随便跟我说话就行——碎碎念、待办、心情都可以，我会拆成结构化条目存进 TinyPA。早报也会推到这里。\n\n输入 /unbind 可以随时解绑。"
    );
    return NextResponse.json({ ok: true });
  }

  // ----- /unbind -----
  if (text === "/unbind") {
    const removed = await db
      .delete(pushSubs)
      .where(
        and(
          eq(pushSubs.channel, "telegram"),
          sql`(${pushSubs.endpoint}->>'chat_id')::bigint = ${chatId}`
        )
      );
    const count = removed.count ?? 0;
    await sendTelegramMessage(
      chatId,
      count > 0 ? "已解绑 👋 随时可以用 /start <token> 重新绑定。" : "这个对话没有绑定。"
    );
    return NextResponse.json({ ok: true });
  }

  // ----- Regular message: find user by chat_id and ingest -----
  const [sub] = await db
    .select()
    .from(pushSubs)
    .where(
      and(
        eq(pushSubs.channel, "telegram"),
        eq(pushSubs.enabled, true),
        sql`(${pushSubs.endpoint}->>'chat_id')::bigint = ${chatId}`
      )
    );

  if (!sub) {
    await sendTelegramMessage(
      chatId,
      "还没有绑定 TinyPA 账号。到网页版设置页生成一个 token，然后 /start <token> 绑定。"
    );
    return NextResponse.json({ ok: true });
  }

  // Slash commands other than /start and /unbind: unknown
  if (text.startsWith("/")) {
    await sendTelegramMessage(chatId, "支持的命令：/start <token> 绑定，/unbind 解绑。直接发文字会被整理成 TinyPA 条目。");
    return NextResponse.json({ ok: true });
  }

  if (text.length > 4000) {
    await sendTelegramMessage(chatId, "这条太长了（>4000 字），拆短一点再发。");
    return NextResponse.json({ ok: true });
  }

  const [user] = await db.select().from(users).where(eq(users.id, sub.userId));
  const timezone = user?.timezone ?? "Asia/Shanghai";

  const [stored] = await db
    .insert(messages)
    .values({ userId: sub.userId, rawText: text })
    .returning();

  after(async () => {
    const t0 = Date.now();
    try {
      const { items } = await extractForMessage(stored.id, sub.userId, timezone);
      const breakdown = countByType(items.map((i) => i.type));
      const reply = buildIngestReply(breakdown);
      await sendTelegramMessage(chatId, reply);
      console.log("[telegram] extracted", { msgId: stored.id, count: items.length, ms: Date.now() - t0 });
    } catch (err) {
      console.error("[telegram] extract failed", {
        msgId: stored.id,
        err: err instanceof Error ? err.message : String(err),
      });
      Sentry.captureException(err, {
        tags: { component: "telegram.extract" },
        extra: { msgId: stored.id },
        user: { id: sub.userId },
      });
      await sendTelegramMessage(chatId, "已记录原文，但 AI 整理失败了，可以到网页上查看。");
    } finally {
      await db
        .update(messages)
        .set({ processedAt: new Date() })
        .where(eq(messages.id, stored.id))
        .catch(() => null);
    }
  });

  // Ack immediately so Telegram doesn't retry.
  return NextResponse.json({ ok: true });
}

function countByType(types: string[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const t of types) acc[t] = (acc[t] ?? 0) + 1;
  return acc;
}

function buildIngestReply(counts: Record<string, number>): string {
  const parts: string[] = [];
  if (counts.todo) parts.push(`${counts.todo} 个待办`);
  if (counts.followup) parts.push(`${counts.followup} 条待跟进`);
  if (counts.mood) parts.push(`${counts.mood} 条心情`);
  if (counts.note) parts.push(`${counts.note} 条笔记`);
  if (!parts.length) return "已记录 📝";
  return `已整理：${parts.join("、")} ✨`;
}
