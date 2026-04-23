import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, messages, users } from "@/lib/db";
import { extractForMessage } from "@/lib/jobs/extract";
import { eq, desc } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.userId, session.user.id))
    .orderBy(desc(messages.createdAt))
    .limit(50);
  return NextResponse.json({ messages: rows.reverse() });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: "too_long" }, { status: 400 });

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id));
  const timezone = user?.timezone ?? "Asia/Shanghai";

  const [msg] = await db
    .insert(messages)
    .values({ userId: session.user.id, rawText: text })
    .returning();

  try {
    const { items } = await extractForMessage(msg.id, session.user.id, timezone);
    return NextResponse.json({ message: msg, items });
  } catch (err) {
    console.error("[messages] extract failed", err);
    return NextResponse.json({ message: msg, items: [], extractError: true });
  }
}
