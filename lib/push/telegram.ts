import { and, eq, inArray } from "drizzle-orm";
import { db, pushSubs } from "@/lib/db";

const API_BASE = "https://api.telegram.org";

export type TelegramEndpoint = {
  chat_id: number;
  username?: string;
  first_name?: string;
};

function botToken() {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) return null;
  return t;
}

type SendResult = { ok: boolean; error_code?: number; description?: string };

export async function sendTelegramMessage(
  chatId: number,
  text: string,
  opts?: { replyMarkup?: unknown; parseMode?: "Markdown" | "HTML" }
): Promise<SendResult> {
  const token = botToken();
  if (!token) return { ok: false, description: "no_token" };

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };
  if (opts?.parseMode) body.parse_mode = opts.parseMode;
  if (opts?.replyMarkup) body.reply_markup = opts.replyMarkup;

  const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as SendResult;
  if (!json.ok) {
    console.error("[telegram] send failed", { chatId, status: res.status, ...json });
  }
  return json;
}

/**
 * Send a message to every telegram subscription of a user.
 * Prunes chat_ids that return 403 (user blocked bot) or 400 (chat not found).
 */
export async function sendTelegramToUser(
  userId: string,
  text: string,
  opts?: { parseMode?: "Markdown" | "HTML" }
): Promise<{ sent: number; pruned: number; failed: number }> {
  const rows = await db
    .select()
    .from(pushSubs)
    .where(and(eq(pushSubs.userId, userId), eq(pushSubs.channel, "telegram"), eq(pushSubs.enabled, true)));

  if (!rows.length) return { sent: 0, pruned: 0, failed: 0 };

  const pruneIds: string[] = [];
  let sent = 0;
  let failed = 0;

  await Promise.all(
    rows.map(async (row) => {
      const ep = row.endpoint as unknown as TelegramEndpoint;
      if (!ep?.chat_id) {
        pruneIds.push(row.id);
        return;
      }
      const result = await sendTelegramMessage(ep.chat_id, text, opts);
      if (result.ok) {
        sent++;
        return;
      }
      // 403 = user blocked bot; 400 with "chat not found" = deleted
      if (result.error_code === 403 || result.error_code === 400) {
        pruneIds.push(row.id);
      } else {
        failed++;
      }
    })
  );

  if (pruneIds.length) {
    await db.delete(pushSubs).where(inArray(pushSubs.id, pruneIds));
  }

  return { sent, pruned: pruneIds.length, failed };
}

export async function getBotInfo(): Promise<{ username: string; id: number } | null> {
  const token = botToken();
  if (!token) return null;
  const res = await fetch(`${API_BASE}/bot${token}/getMe`);
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: { username: string; id: number } };
  if (!json.ok || !json.result) return null;
  return { username: json.result.username, id: json.result.id };
}
