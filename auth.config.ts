import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login", verifyRequest: "/login?sent=1" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && token?.id) session.user.id = token.id as string;
      return session;
    },
  },
};
