import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  session: { strategy: "database" },
  pages: { signIn: "/login", verifyRequest: "/login?sent=1" },
  providers: [],
  callbacks: {
    session({ session, user }) {
      if (session.user && user) session.user.id = user.id;
      return session;
    },
  },
};
