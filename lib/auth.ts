import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "sandbox_studio_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be configured with at least 32 characters. Copy .env.example and set a strong secret.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken() {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("admin")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function isValidSessionToken(token: string | undefined) {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return payload.sub === "admin" && payload.role === "admin";
  } catch {
    return false;
  }
}

export async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!(await isValidSessionToken(token))) {
    return false;
  }
  return true;
}

// SameSite=Strict is the primary CSRF guard. This adds a same-origin check for browser mutations.
export function hasValidOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Allows intentional command-line API calls when the operator has a session.
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.SESSION_COOKIE_SECURE === "true" || (process.env.NODE_ENV === "production" && process.env.SESSION_COOKIE_SECURE !== "false"),
  sameSite: "strict" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};
