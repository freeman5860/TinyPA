import webpush from "web-push";
import { and, eq, inArray } from "drizzle-orm";
import { db, pushSubs } from "@/lib/db";
import * as Sentry from "@sentry/nextjs";

let configured = false;

function configure() {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@tinypa.local";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export type WebPushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export type PushSubscriptionJSON = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

type WebPushSendError = Error & { statusCode?: number };

/**
 * Send a webpush notification to every enabled webpush subscription of a user.
 * Auto-prunes subscriptions that return 404/410 (unsubscribed / expired).
 */
export async function sendWebPushToUser(
  userId: string,
  payload: WebPushPayload
): Promise<{ sent: number; pruned: number; failed: number }> {
  if (!configure()) {
    console.warn("[webpush] VAPID keys not configured, skipping");
    return { sent: 0, pruned: 0, failed: 0 };
  }

  const rows = await db
    .select()
    .from(pushSubs)
    .where(and(eq(pushSubs.userId, userId), eq(pushSubs.channel, "webpush"), eq(pushSubs.enabled, true)));

  if (!rows.length) return { sent: 0, pruned: 0, failed: 0 };

  const body = JSON.stringify(payload);
  const pruneIds: string[] = [];
  let sent = 0;
  let failed = 0;

  await Promise.all(
    rows.map(async (row) => {
      const sub = row.endpoint as unknown as PushSubscriptionJSON;
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
        pruneIds.push(row.id);
        return;
      }
      try {
        await webpush.sendNotification(sub, body, { TTL: 60 * 60 * 24 });
        sent++;
      } catch (err) {
        const e = err as WebPushSendError;
        if (e.statusCode === 404 || e.statusCode === 410) {
          pruneIds.push(row.id);
        } else {
          failed++;
          console.error("[webpush] send failed", { id: row.id, status: e.statusCode, message: e.message });
          Sentry.captureException(err, {
            tags: { component: "webpush" },
            extra: { statusCode: e.statusCode, subId: row.id },
          });
        }
      }
    })
  );

  if (pruneIds.length) {
    await db.delete(pushSubs).where(inArray(pushSubs.id, pruneIds));
  }

  return { sent, pruned: pruneIds.length, failed };
}
