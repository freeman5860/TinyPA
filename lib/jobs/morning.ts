import { db, users, digests, items } from "@/lib/db";
import { and, eq, inArray, desc } from "drizzle-orm";
import { resend, MAIL_FROM } from "@/lib/push/email";
import { yesterdayIsoDate } from "@/lib/time";

export async function sendMorningForUser(userId: string, when: Date = new Date()) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user?.email) return { sent: false, reason: "no_user" };
  const tz = user.timezone;
  const yDate = yesterdayIsoDate(tz, when);

  const [digest] = await db
    .select()
    .from(digests)
    .where(and(eq(digests.userId, userId), eq(digests.date, yDate)))
    .orderBy(desc(digests.createdAt));
  if (!digest) return { sent: false, reason: "no_digest" };
  if (digest.morningSentAt) return { sent: false, reason: "already_sent" };

  const topIds = digest.topTodoIds ?? [];
  const topRows = topIds.length
    ? await db
        .select()
        .from(items)
        .where(and(eq(items.userId, userId), inArray(items.id, topIds)))
    : [];
  const topByStatus = topRows.filter((r) => r.status === "open");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const todoHtml = topByStatus.length
    ? `<ol style="padding-left:20px;color:#222">
        ${topByStatus
          .map(
            (t) =>
              `<li style="margin:6px 0">${escapeHtml(t.content)}${
                t.dueAt
                  ? ` <span style="color:#888;font-size:13px">(${new Date(t.dueAt).toLocaleString(
                      "zh-CN",
                      { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
                    )})</span>`
                  : ""
              }</li>`
          )
          .join("")}
      </ol>`
    : `<p style="color:#888">今天没有特别着急的待办 ☕️</p>`;

  await resend().emails.send({
    from: MAIL_FROM,
    to: user.email,
    subject: `TinyPA 早报 · ${new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric" })}`,
    html: `
      <div style="font-family:-apple-system,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#222">
        <h2 style="margin:0 0 4px">早安，${user.name ?? "你"}</h2>
        <p style="margin:0 0 20px;color:#888">下面是昨天的复盘和今天最值得先做的几件事。</p>
        <h3 style="margin:0 0 8px">今天先做</h3>
        ${todoHtml}
        <h3 style="margin:24px 0 8px">昨日复盘</h3>
        <div style="white-space:pre-wrap;line-height:1.7">${escapeHtml(digest.summaryMd)}</div>
        <p style="margin-top:28px">
          <a href="${appUrl}" style="display:inline-block;padding:10px 16px;background:#7c83ff;color:#fff;border-radius:8px;text-decoration:none">打开 TinyPA</a>
        </p>
      </div>
    `,
  });

  await db
    .update(digests)
    .set({ morningSentAt: new Date() })
    .where(eq(digests.id, digest.id));

  return { sent: true };
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
