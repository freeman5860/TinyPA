import { db, messages, items, digests, users } from "@/lib/db";
import { and, eq, gte, lte, isNull, or, asc } from "drizzle-orm";
import { getLLM } from "@/lib/llm/gemma";
import { dayRangeInTz, todayIsoDate } from "@/lib/time";

export async function generateDigestForUser(userId: string, when: Date = new Date()) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return null;
  const tz = user.timezone;
  const { start, end } = dayRangeInTz(when, tz);
  const date = todayIsoDate(tz, when);

  const existing = await db
    .select()
    .from(digests)
    .where(and(eq(digests.userId, userId), eq(digests.date, date)));
  if (existing.length) return existing[0];

  const todayMessages = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.userId, userId),
        gte(messages.createdAt, start),
        lte(messages.createdAt, end)
      )
    )
    .orderBy(asc(messages.createdAt));

  const todayItems = await db
    .select()
    .from(items)
    .where(
      and(
        eq(items.userId, userId),
        gte(items.createdAt, start),
        lte(items.createdAt, end)
      )
    );

  const openTodos = await db
    .select()
    .from(items)
    .where(
      and(
        eq(items.userId, userId),
        eq(items.type, "todo"),
        eq(items.status, "open"),
        or(isNull(items.dueAt), lte(items.dueAt, new Date(end.getTime() + 3 * 24 * 3600 * 1000)))
      )
    )
    .orderBy(asc(items.priority), asc(items.dueAt))
    .limit(12);

  if (!todayMessages.length && !todayItems.length) {
    const fallback = await db
      .insert(digests)
      .values({
        userId,
        date,
        summaryMd:
          "## 今天\n今天没有新的碎碎念，也没关系。明天想说的话，我都在。",
        topTodoIds: openTodos.slice(0, 3).map((t) => t.id),
      })
      .returning();
    return fallback[0];
  }

  const llm = getLLM();
  const { summaryMd, topTodoIds } = await llm.digest({
    date,
    timezone: tz,
    messages: todayMessages.map((m) => ({
      createdAt: m.createdAt.toISOString(),
      rawText: m.rawText,
    })),
    items: todayItems.map((i) => ({
      type: i.type,
      content: i.content,
      status: i.status,
      dueAt: i.dueAt ? i.dueAt.toISOString() : null,
      completedAt: i.completedAt ? i.completedAt.toISOString() : null,
    })),
    openTodos: openTodos.map((t) => ({
      id: t.id,
      content: t.content,
      dueAt: t.dueAt ? t.dueAt.toISOString() : null,
      priority: t.priority,
    })),
  });

  const finalTopIds = topTodoIds.length ? topTodoIds : openTodos.slice(0, 3).map((t) => t.id);

  const [row] = await db
    .insert(digests)
    .values({ userId, date, summaryMd, topTodoIds: finalTopIds })
    .returning();
  return row;
}
