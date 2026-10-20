import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth";

// Small in-memory throttle for local/single-instance deployments. Put auth behind a real identity
// provider or shared rate limiter before running multiple app replicas on a public network.
const attempts = new Map<string, { count: number; startedAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;
// Caps attempts from all clients combined, so rotating the client key (or many addresses behind
// a trusted proxy) cannot add guesses. It also bounds how many keys the map can hold per window.
const MAX_GLOBAL_ATTEMPTS = 30;
const GLOBAL_KEY = "*";
// Number of reverse proxies in front of the app that append to X-Forwarded-For. With 0 (the
// default, matching the localhost-only Compose setup) the header is client-controlled and ignored.
const TRUSTED_PROXY_COUNT = Math.max(0, Number.parseInt(process.env.TRUSTED_PROXY_COUNT ?? "0", 10) || 0);
let lastPrunedAt = 0;

function clientKey(request: NextRequest) {
  if (TRUSTED_PROXY_COUNT === 0) return "local";
  // Each trusted proxy appends the address it received from, so the entry TRUSTED_PROXY_COUNT
  // from the end was written by our outermost proxy. Anything to its left came from the client.
  const hops = (request.headers.get("x-forwarded-for") ?? "").split(",").map((hop) => hop.trim()).filter(Boolean);
  return hops[hops.length - TRUSTED_PROXY_COUNT] ?? "unknown";
}

function pruneExpired(now: number) {
  if (now - lastPrunedAt < WINDOW_MS) return;
  lastPrunedAt = now;
  for (const [key, record] of attempts) {
    if (now - record.startedAt > WINDOW_MS) attempts.delete(key);
  }
}

function currentRecord(key: string, now: number) {
  const previous = attempts.get(key);
  if (previous && now - previous.startedAt <= WINDOW_MS) return previous;
  const record = { count: 0, startedAt: now };
  attempts.set(key, record);
  return record;
}

function fixedTimeEquals(left: string, right: string) {
  // Hash first so timingSafeEqual always receives two buffers of the same length.
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const now = Date.now();
  pruneExpired(now);
  const key = clientKey(request);
  const record = currentRecord(key, now);
  const global = currentRecord(GLOBAL_KEY, now);
  if (record.count >= MAX_ATTEMPTS || global.count >= MAX_GLOBAL_ATTEMPTS) {
    return NextResponse.json({ error: "Too many login attempts. Wait a minute and try again." }, { status: 429 });
  }
  // Count the attempt before any await so concurrent requests cannot all pass the check above.
  record.count += 1;
  global.count += 1;

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
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  attempts.delete(key);
  global.count -= 1;
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
