import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.SESSION_COOKIE_SECURE === "true" || (process.env.NODE_ENV === "production" && process.env.SESSION_COOKIE_SECURE !== "false"),
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
