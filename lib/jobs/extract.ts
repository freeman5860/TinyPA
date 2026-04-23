import { db, messages, items } from "@/lib/db";
import { getLLM } from "@/lib/llm/gemma";
import { eq } from "drizzle-orm";

export async function extractForMessage(messageId: string, userId: string, timezone: string) {
  const [msg] = await db.select().from(messages).where(eq(messages.id, messageId));
  if (!msg) return { items: [] as typeof items.$inferSelect[] };

  const llm = getLLM();
  const result = await llm.extract({
    text: msg.rawText,
    now: new Date().toISOString(),
    timezone,
  });

  const rows = result.items.map((i) => ({
    userId,
    messageId,
    type: i.type,
    content: i.content,
    dueAt: i.due_at ? new Date(i.due_at) : null,
    priority: i.priority ?? 2,
    tags: i.tags ?? [],
  }));

  let inserted: typeof items.$inferSelect[] = [];
  if (rows.length) {
    inserted = await db.insert(items).values(rows).returning();
  }
  await db
    .update(messages)
    .set({ processedAt: new Date() })
    .where(eq(messages.id, messageId));

  return { items: inserted };
}
