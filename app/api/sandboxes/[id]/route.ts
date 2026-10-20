import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, hasValidOrigin } from "@/lib/auth";
import { deleteSandbox, getSandbox } from "@/lib/sandbox-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  try {
    const data = await getSandbox(id);
    if (!data) return NextResponse.json({ error: "Sandbox not found." }, { status: 404 });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch sandbox.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // if (!hasValidOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const { id } = await context.params;
  try {
    const data = await deleteSandbox(id);
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete sandbox.";
    return NextResponse.json({ error: message }, { status: message === "Sandbox not found." ? 404 : 500 });
  }
}
