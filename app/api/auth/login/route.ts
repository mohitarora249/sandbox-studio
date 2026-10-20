import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth";

// Small in-memory throttle for local/single-instance deployments. Put auth behind a real identity
// provider or shared rate limiter before running multiple app replicas on a public network.
const attempts = new Map<string, { count: number; startedAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;

function fixedTimeEquals(left: string, right: string) {
  // Hash first so timingSafeEqual always receives two buffers of the same length.
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientKey = forwardedFor || "local";
  const now = Date.now();
  const previous = attempts.get(clientKey);
  const record = !previous || now - previous.startedAt > WINDOW_MS
    ? { count: 0, startedAt: now }
    : previous;
  if (record.count >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "Too many login attempts. Wait a minute and try again." }, { status: 429 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const input = body as { username?: unknown; password?: unknown };
  if (typeof input.username !== "string" || typeof input.password !== "string") {
    return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
  }

  const expectedUsername = process.env.ADMIN_USERNAME || "admin";
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedPassword) return NextResponse.json({ error: "ADMIN_PASSWORD is not configured on the server." }, { status: 500 });

  const valid = fixedTimeEquals(input.username, expectedUsername) && fixedTimeEquals(input.password, expectedPassword);
  if (!valid) {
    record.count += 1;
    attempts.set(clientKey, record);
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  attempts.delete(clientKey);
  try {
    const token = await createSessionToken();
    const response = NextResponse.json({ ok: true });
    response.cookies.set("sandbox_studio_session", token, sessionCookieOptions);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
