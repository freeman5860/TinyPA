import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db, items } from "@/lib/db";
import { and, eq, gte, or, desc } from "drizzle-orm";
import { TreeScene, type SceneItem } from "@/components/TreeScene";

export const dynamic = "force-dynamic";

const NOTE_LOOKBACK_DAYS = 30;
const MOOD_LOOKBACK_DAYS = 14;
// Items rendered as nodes — keep total bounded so the tree doesn't get
// crowded with hundreds of leaves on long-time users.
const MAX_NODES = 60;

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;
  const now = new Date();
  const noteSince = new Date(now.getTime() - NOTE_LOOKBACK_DAYS * 24 * 3600 * 1000);
  const moodSince = new Date(now.getTime() - MOOD_LOOKBACK_DAYS * 24 * 3600 * 1000);

  // Pull open todos & followups (any age) plus recent notes/moods. We want
  // the tree to show "current life" — open work + recent thoughts.
  const rows = await db
    .select()
    .from(items)
    .where(
      and(
        eq(items.userId, userId),
        or(
          and(eq(items.type, "todo"), eq(items.status, "open")),
          and(eq(items.type, "followup"), eq(items.status, "open")),
          and(eq(items.type, "note"), gte(items.createdAt, noteSince)),
          and(eq(items.type, "mood"), gte(items.createdAt, moodSince)),
        ),
      ),
    )
    .orderBy(desc(items.createdAt))
    .limit(MAX_NODES);

  const sceneItems: SceneItem[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    content: r.content,
    status: r.status,
    priority: r.priority,
    dueAt: r.dueAt ? r.dueAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    tags: r.tags ?? [],
  }));

  return <TreeScene initialItems={sceneItems} />;
}
