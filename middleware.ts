import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth: edgeAuth } = NextAuth(authConfig);

export default edgeAuth((req) => {
  const { nextUrl } = req;
  const isAuth = !!req.auth;
  const isLoginPage = nextUrl.pathname === "/login";
  const isApiAuth = nextUrl.pathname.startsWith("/api/auth");
  const isCron = nextUrl.pathname.startsWith("/api/cron");
  const isPublicAsset =
    nextUrl.pathname === "/manifest.json" ||
    nextUrl.pathname === "/sw.js" ||
    nextUrl.pathname === "/icon.svg" ||
    nextUrl.pathname.startsWith("/icons/") ||
    nextUrl.pathname.startsWith("/_next");

  if (isApiAuth || isCron || isPublicAsset) return NextResponse.next();

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
