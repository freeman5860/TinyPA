import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db, digests } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import ReactMarkdown from "react-markdown";

export const dynamic = "force-dynamic";

export default async function ReviewDetail({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { date } = await params;
  const [row] = await db
    .select()
    .from(digests)
    .where(and(eq(digests.userId, session.user.id), eq(digests.date, date)));
  if (!row) notFound();

  return (
    <div className="mx-auto max-w-xl px-4 py-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <Link href="/review" className="text-sm text-mute hover:text-ink">
            ← 复盘列表
          </Link>
          <h1 className="mt-1 text-xl font-semibold">{row.date}</h1>
        </div>
      </header>
      <article className="prose prose-invert max-w-none rounded-xl border border-border bg-panel p-5 text-[15px] leading-relaxed">
        <ReactMarkdown>{row.summaryMd}</ReactMarkdown>
      </article>
    </div>
  );
}
