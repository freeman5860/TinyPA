import { signIn } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; email?: string }>;
}) {
  const sp = await searchParams;
  const sent = sp.sent === "1";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
      <div className="w-full rounded-2xl border border-border bg-panel p-6">
        <h1 className="text-2xl font-semibold">TinyPA</h1>
        <p className="mt-1 text-sm text-mute">碎碎念，交给我。</p>

        {sent ? (
          <div className="mt-6 rounded-lg border border-border bg-bg p-4 text-sm">
            登录链接已发到 <span className="text-accent">{sp.email}</span> 邮箱。
            <br />
            点邮件里的按钮就能回来。
          </div>
        ) : (
          <form
            action={async (fd) => {
              "use server";
              const email = String(fd.get("email") ?? "").trim();
              if (!email) return;
              await signIn("email", { email, redirectTo: "/" });
            }}
            className="mt-6 space-y-3"
          >
            <input
              type="email"
              name="email"
              required
              placeholder="你的邮箱"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-ink outline-none focus:border-accent"
              autoFocus
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-accent py-2.5 font-medium text-white hover:opacity-90"
            >
              发送登录链接
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
