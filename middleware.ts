import { NextRequest, NextResponse } from "next/server";
import { isValidSessionToken, SESSION_COOKIE } from "@/lib/auth";

// The middleware protects page navigation for a smooth login redirect. API routes independently
// call requireAdmin(), because API security must not depend solely on middleware behavior.
export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/login") return NextResponse.next();
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await isValidSessionToken(token)) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
