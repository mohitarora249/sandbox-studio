import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, hasValidOrigin } from "@/lib/auth";
import { keepAliveSchema } from "@/lib/validation";
import { keepSandboxAlive, releaseSandboxKeepAlive } from "@/lib/sandbox-service";

type RouteContext = { params: Promise<{ id: string }> };

function statusFor(message: string) {
  if (message === "Sandbox not found.") return 404;
  if (message.startsWith("Only running or stopped")) return 409;
  return 500;
}

// Takes out (or renews) a keep-alive lease: the idle reaper won't stop or destroy the sandbox until
// it expires. Body: { "minutes": number }.
export async function POST(request: NextRequest, context: RouteContext) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // if (!hasValidOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const parsed = keepAliveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid lease." }, { status: 400 });
  try {
    const { id } = await context.params;
    return NextResponse.json({ data: await keepSandboxAlive(id, parsed.data.minutes) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to keep sandbox alive.";
    return NextResponse.json({ error: message }, { status: statusFor(message) });
  }
}

// Releases the lease early so the normal idle timers apply again.
export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // if (!hasValidOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const { id } = await context.params;
    return NextResponse.json({ data: await releaseSandboxKeepAlive(id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to release keep-alive lease.";
    return NextResponse.json({ error: message }, { status: statusFor(message) });
  }
}
