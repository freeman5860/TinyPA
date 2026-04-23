import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db, digests } from "@/lib/db";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ReviewIndex() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const rows = await db
    .select({ id: digests.id, date: digests.date, createdAt: digests.createdAt })
    .from(digests)
    .where(eq(digests.userId, session.user.id))
    .orderBy(desc(digests.date))
    .limit(60);

  return (
    <div className="mx-auto max-w-xl px-4 py-4">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">复盘</h1>
        <p className="text-xs text-mute">每晚 22 点自动生成。</p>
      </header>
      <ul className="flex flex-col gap-1.5">
        {rows.length === 0 && (
          <li className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-mute">
            还没有复盘。今晚 22 点后回来看看？
          </li>
        )}
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/review/${r.date}`}
              className="flex items-center justify-between rounded-xl border border-border bg-panel px-4 py-3 hover:border-accent"
            >
              <div>
                <div className="font-medium">{r.date}</div>
                <div className="text-xs text-mute">
                  {new Date(r.createdAt).toLocaleString("zh-CN", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
              <span className="text-mute">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
