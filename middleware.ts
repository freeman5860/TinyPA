import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { ipAuthLimit, safeLimit } from "@/lib/ratelimit";

const { auth: edgeAuth } = NextAuth(authConfig);

export default edgeAuth(async (req) => {
  const { nextUrl } = req;
  const isAuth = !!req.auth;
  const isLoginPage = nextUrl.pathname === "/login";
  const isConfirmPage = nextUrl.pathname === "/auth/confirm";
  const isLegalPage = nextUrl.pathname === "/privacy" || nextUrl.pathname === "/terms";
  const isApiAuth = nextUrl.pathname.startsWith("/api/auth");
  const isCron = nextUrl.pathname.startsWith("/api/cron");
  const isDebug = nextUrl.pathname.startsWith("/api/debug");
  const isPublicAsset =
    nextUrl.pathname === "/manifest.json" ||
    nextUrl.pathname === "/sw.js" ||
    nextUrl.pathname === "/icon.svg" ||
    nextUrl.pathname.startsWith("/icons/") ||
    nextUrl.pathname.startsWith("/_next");

  if (
    req.method === "POST" &&
    nextUrl.pathname === "/api/auth/signin/email"
  ) {
    const fwd = req.headers.get("x-forwarded-for") ?? "";
    const ip = fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await safeLimit(ipAuthLimit, ip, "ip-auth");
    if (!allowed) {
      return new NextResponse("Too many requests", { status: 429 });
    }
  }

  if (isApiAuth || isCron || isDebug || isPublicAsset || isConfirmPage || isLegalPage) return NextResponse.next();

  if (!isAuth && !isLoginPage) {
    const url = nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (isAuth && isLoginPage) {
    const url = nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
