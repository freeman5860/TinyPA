import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db, items, users } from "@/lib/db";
import { and, eq, gte, lte, desc, asc } from "drizzle-orm";
import { dayRangeInTz } from "@/lib/time";
import { TodayClient } from "./TodayClient";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id));
  const tz = user?.timezone ?? "Asia/Shanghai";
  const { start, end } = dayRangeInTz(new Date(), tz);

  const openTodos = await db
    .select()
    .from(items)
    .where(
      and(
        eq(items.userId, session.user.id),
        eq(items.type, "todo"),
        eq(items.status, "open")
      )
    )
    .orderBy(asc(items.priority), asc(items.dueAt));

  const todayItems = await db
    .select()
    .from(items)
    .where(
      and(
        eq(items.userId, session.user.id),
        gte(items.createdAt, start),
        lte(items.createdAt, end)
      )
    )
    .orderBy(desc(items.createdAt));

  return (
    <TodayClient
      tz={tz}
      openTodos={serialize(openTodos)}
      todayItems={serialize(todayItems)}
    />
  );
}

function serialize<T extends { dueAt: Date | null; createdAt: Date; completedAt: Date | null }>(
  rows: T[]
) {
  return rows.map((r) => ({
    ...r,
    dueAt: r.dueAt ? r.dueAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  }));
}
