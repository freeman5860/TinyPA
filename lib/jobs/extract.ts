import { db, messages, items } from "@/lib/db";
import { getLLM } from "@/lib/llm/gemma";
import { getEmbed } from "@/lib/llm/embedding";
import { eq } from "drizzle-orm";

export async function extractForMessage(messageId: string, userId: string, timezone: string) {
  const [msg] = await db.select().from(messages).where(eq(messages.id, messageId));
  if (!msg) return { items: [] as (typeof items.$inferSelect)[] };

  const llm = getLLM();
  const inserted: (typeof items.$inferSelect)[] = [];

  let streamErr: unknown = null;
  try {
    await llm.extract(
      {
        text: msg.rawText,
        now: new Date().toISOString(),
        timezone,
      },
      async (item) => {
        if (item.type === "reply") {
          await db
            .update(messages)
            .set({ replyText: item.content })
            .where(eq(messages.id, messageId));
          return;
        }
        const [row] = await db
          .insert(items)
          .values({
            userId,
            messageId,
            type: item.type,
            content: item.content,
            dueAt: item.due_at ? new Date(item.due_at) : null,
            priority: item.priority ?? 2,
            tags: item.tags ?? [],
          })
          .returning();
        if (item.type === "note") {
          try {
            const [vec] = await getEmbed().embed([item.content]);
            if (vec && vec.length > 0) {
              await db
                .update(items)
                .set({ embedding: vec })
                .where(eq(items.id, row.id));
              row.embedding = vec;
            }
          } catch (err) {
            console.error("[extract] embed failed, note saved without embedding", {
              itemId: row.id,
              err: err instanceof Error ? err.message : String(err),
            });
          }
        }
        inserted.push(row);
      }
    );
  } catch (err) {
    streamErr = err;
    console.error("[extract] stream interrupted, keeping partial items", {
      messageId,
      count: inserted.length,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  await db
    .update(messages)
    .set({ processedAt: new Date() })
    .where(eq(messages.id, messageId));

  if (streamErr && inserted.length === 0) throw streamErr;
  return { items: inserted };
}
