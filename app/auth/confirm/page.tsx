import Link from "next/link";

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

  const qs = new URLSearchParams();
  if (token) qs.set("token", token);
  if (email) qs.set("email", email);
  if (callbackUrl) qs.set("callbackUrl", callbackUrl);
  const confirmHref = `/api/auth/callback/email?${qs.toString()}`;

  const valid = token && email;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
      <div className="w-full rounded-2xl border border-border bg-panel p-6">
        <h1 className="text-2xl font-semibold">确认登录 TinyPA</h1>
        {valid ? (
          <>
            <p className="mt-2 text-sm text-mute">
              即将以 <span className="text-ink">{email}</span> 登录。
            </p>
            <Link
              href={confirmHref}
              prefetch={false}
              className="mt-6 block w-full rounded-lg bg-accent py-2.5 text-center font-medium text-white hover:opacity-90"
            >
              确认登录
            </Link>
            <p className="mt-3 text-xs text-mute">
              这一步是为了防止邮件客户端自动预取链接消耗掉一次性 token。
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
