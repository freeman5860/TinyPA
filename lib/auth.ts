import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema";
import { resend, MAIL_FROM } from "@/lib/push/email";
import { authConfig } from "@/auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    {
      id: "email",
      name: "Email",
      type: "email",
      maxAge: 60 * 15,
      async sendVerificationRequest({ identifier, url }) {
        // Gmail and other providers GET-prefetch links in emails to scan them,
        // which consumes the one-time token before the user clicks. Rewrite the
        // email link to a static confirm page; user clicks "confirm" there to
        // actually hit the Auth.js callback.
        const original = new URL(url);
        const confirmUrl = new URL("/auth/confirm", original.origin);
        confirmUrl.search = original.search;
        const host = original.host;

        const { data, error } = await resend().emails.send({
          from: MAIL_FROM,
          to: identifier,
          subject: `登录 TinyPA`,
          text: `点击链接登录（15 分钟内有效）：\n${confirmUrl.toString()}\n\n如果你没有请求登录，请忽略此邮件。`,
          html: `
            <div style="font-family:-apple-system,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#222">
              <h2 style="margin:0 0 12px">登录 TinyPA</h2>
              <p>点击下面的按钮完成登录（15 分钟内有效）：</p>
              <p><a href="${confirmUrl.toString()}" style="display:inline-block;padding:12px 20px;background:#7c83ff;color:#fff;border-radius:8px;text-decoration:none">登录到 ${host}</a></p>
              <p style="color:#888;font-size:13px">如果按钮不能点，复制这个链接：<br>${confirmUrl.toString()}</p>
              <p style="color:#888;font-size:13px">如果你没有请求登录，请忽略此邮件。</p>
            </div>
          `,
        });
        if (error) {
          console.error("[auth.email] resend send failed", {
            to: identifier,
            from: MAIL_FROM,
            name: error.name,
            message: error.message,
          });
          throw new Error(`Resend error: ${error.name}: ${error.message}`);
        }
        console.log("[auth.email] sent", { to: identifier, id: data?.id });
      },
    },
  ],
});
