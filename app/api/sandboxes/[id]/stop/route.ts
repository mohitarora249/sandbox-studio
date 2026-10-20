import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, hasValidOrigin } from "@/lib/auth";
import { stopSandbox } from "@/lib/sandbox-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // if (!hasValidOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const { id } = await context.params;
    return NextResponse.json({ data: await stopSandbox(id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to stop sandbox.";
    return NextResponse.json({ error: message }, { status: message === "Sandbox not found." ? 404 : 500 });
  }
}
