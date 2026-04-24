import { NextRequest, NextResponse } from "next/server";
import { db, users } from "@/lib/db";
import { sendMorningForUser } from "@/lib/jobs/morning";
import { eq } from "drizzle-orm";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const query = new URL(req.url).searchParams.get("secret");
  return header === secret || query === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const targetUser = url.searchParams.get("user");
  const whenParam = url.searchParams.get("when");
  const when = whenParam ? new Date(whenParam) : new Date();
  if (whenParam && Number.isNaN(when.getTime())) {
    return NextResponse.json({ error: "bad_when" }, { status: 400 });
  }

  const rows = targetUser
    ? await db.select().from(users).where(eq(users.id, targetUser))
    : await db.select().from(users);

  const results: { userId: string; sent: boolean; reason?: string }[] = [];
  for (const u of rows) {
    try {
      const r = await sendMorningForUser(u.id, when);
      results.push({ userId: u.id, sent: r.sent, reason: r.reason });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[cron/morning]", u.id, msg);
      results.push({ userId: u.id, sent: false, reason: msg });
    }
  }
  return NextResponse.json({ count: results.length, results });
}
