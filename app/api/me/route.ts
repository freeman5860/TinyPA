import { NextRequest, NextResponse } from "next/server";
import { auth, signOut } from "@/lib/auth";
import { db, users } from "@/lib/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const schema = z.object({
  timezone: z.string().min(1).max(60).optional(),
  name: z.string().max(60).optional(),
});

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });

  const [updated] = await db
    .update(users)
    .set(parsed.data)
    .where(eq(users.id, session.user.id))
    .returning();
  return NextResponse.json({ user: updated });
}

export async function DELETE() {
  await signOut({ redirect: false });
  return NextResponse.json({ ok: true });
}
