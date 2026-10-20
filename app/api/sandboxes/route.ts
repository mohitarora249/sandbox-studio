import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, hasValidOrigin } from "@/lib/auth";
import { createSandboxSchema } from "@/lib/validation";
import { createSandbox, listSandboxes } from "@/lib/sandbox-service";

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const data = await listSandboxes();
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list sandboxes.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // if (!hasValidOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const parsed = createSandboxSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid sandbox settings." }, { status: 400 });
  }

  try {
    const data = await createSandbox(parsed.data);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create sandbox.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
