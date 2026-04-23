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

  const rows = targetUser
    ? await db.select().from(users).where(eq(users.id, targetUser))
    : await db.select().from(users);

  const results: { userId: string; sent: boolean; reason?: string }[] = [];
  for (const u of rows) {
    try {
      const r = await sendMorningForUser(u.id);
      results.push({ userId: u.id, sent: r.sent, reason: r.reason });
    } catch (err) {
      console.error("[cron/morning]", u.id, err);
      results.push({ userId: u.id, sent: false, reason: "error" });
    }
  }
  return NextResponse.json({ count: results.length, results });
}
