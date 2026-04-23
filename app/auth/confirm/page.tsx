export const dynamic = "force-dynamic";

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const email = typeof sp.email === "string" ? sp.email : "";
  const callbackUrl = typeof sp.callbackUrl === "string" ? sp.callbackUrl : "/";

  const valid = token && email;
  const tokenPreview = token ? `${token.slice(0, 8)}…${token.slice(-4)}` : "";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
      <div className="w-full rounded-2xl border border-border bg-panel p-6">
        <h1 className="text-2xl font-semibold">确认登录 TinyPA</h1>
        {valid ? (
          <>
            <p className="mt-2 text-sm text-mute">
              即将以 <span className="text-ink">{email}</span> 登录。
            </p>
            <p className="mt-1 text-xs text-mute/70">token: {tokenPreview}</p>
            <form action="/api/auth/callback/email" method="GET" className="mt-6">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="email" value={email} />
              <input type="hidden" name="callbackUrl" value={callbackUrl} />
              <button
                type="submit"
                className="block w-full rounded-lg bg-accent py-2.5 font-medium text-white hover:opacity-90"
              >
                确认登录
              </button>
            </form>
            <p className="mt-3 text-xs text-mute">
              这一步用表单提交而不是链接，是为了避开 Gmail 等邮件客户端的反钓鱼扫描器——它们只跟 a 标签，不提交表单。
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-red-300">
            链接参数不完整。请回到登录页重新获取。
          </p>
        )}
      </div>
    </main>
  );
}
