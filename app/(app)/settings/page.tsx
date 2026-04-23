import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db, users } from "@/lib/db";
import { eq } from "drizzle-orm";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const [user] = await db.select().from(users).where(eq(users.id, session.user.id));

  return (
    <div className="mx-auto max-w-xl px-4 py-4">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">设置</h1>
        <p className="text-xs text-mute">{user?.email}</p>
      </header>

      <SettingsForm
        initial={{
          name: user?.name ?? "",
          timezone: user?.timezone ?? "Asia/Shanghai",
        }}
      />

      <div className="mt-6 rounded-xl border border-border bg-panel/60 p-4 text-xs text-mute">
        <div className="mb-1 font-medium text-ink">推送时间</div>
        每晚 22:07 自动生成复盘，次日 08:03 邮件推送早报（北京时间）。多时区自定义需要升级 Vercel Pro，目前 Hobby 档固定。
      </div>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
        className="mt-8"
      >
        <button
          type="submit"
          className="w-full rounded-xl border border-border bg-panel py-2.5 text-sm text-red-300 hover:border-red-500/50"
        >
          退出登录
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-mute">TinyPA · 碎碎念私人助理</p>
    </div>
  );
}
