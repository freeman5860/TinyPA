import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, items } from "@/lib/db";
import { and, eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const patch: Partial<typeof items.$inferInsert> = {};
  if (body.status === "done") {
    patch.status = "done";
    patch.completedAt = new Date();
  } else if (body.status === "open") {
    patch.status = "open";
    patch.completedAt = null;
  } else if (body.status === "dropped") {
    patch.status = "dropped";
  }
  if (typeof body.content === "string" && body.content.trim()) {
    patch.content = body.content.trim().slice(0, 500);
  }
  if (body.dueAt === null) patch.dueAt = null;
  else if (typeof body.dueAt === "string") patch.dueAt = new Date(body.dueAt);
  if (typeof body.priority === "number" && body.priority >= 1 && body.priority <= 3) {
    patch.priority = body.priority;
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 });
  }

  const [updated] = await db
    .update(items)
    .set(patch)
    .where(and(eq(items.id, id), eq(items.userId, session.user.id)))
    .returning();

  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ item: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await db
    .delete(items)
    .where(and(eq(items.id, id), eq(items.userId, session.user.id)));
  return NextResponse.json({ ok: true });
}
