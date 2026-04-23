import { NextRequest, NextResponse } from "next/server";
import { db, users } from "@/lib/db";
import { generateDigestForUser } from "@/lib/jobs/digest";
import { hourInTz } from "@/lib/time";
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
  const force = url.searchParams.get("force") === "1";
  const targetUser = url.searchParams.get("user");

  const rows = targetUser
    ? await db.select().from(users).where(eq(users.id, targetUser))
    : await db.select().from(users);

  const results: { userId: string; ran: boolean; reason?: string }[] = [];
  for (const u of rows) {
    const hour = hourInTz(u.timezone);
    if (!force && hour !== u.digestHour) {
      results.push({ userId: u.id, ran: false, reason: `hour_mismatch(${hour})` });
      continue;
    }
    try {
      await generateDigestForUser(u.id);
      results.push({ userId: u.id, ran: true });
    } catch (err) {
      console.error("[cron/digest]", u.id, err);
      results.push({ userId: u.id, ran: false, reason: "error" });
    }
  }
  return NextResponse.json({ count: results.length, results });
}
