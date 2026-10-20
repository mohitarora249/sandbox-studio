import { PassThrough } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, hasValidOrigin } from "@/lib/auth";
import { commandSchema } from "@/lib/validation";
import { getSandbox, addSandboxEvent } from "@/lib/sandbox-service";
import { getDocker } from "@/lib/docker";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };
const MAX_OUTPUT_BYTES = 24_000;

export async function POST(request: NextRequest, context: RouteContext) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // if (!hasValidOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const parsed = commandSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid command." }, { status: 400 });

  const { id } = await context.params;
  try {
    const sandbox = await getSandbox(id);
    if (!sandbox) return NextResponse.json({ error: "Sandbox not found." }, { status: 404 });
    if (sandbox.status !== "RUNNING" || !sandbox.containerId) {
      return NextResponse.json({ error: "Start the sandbox before running a command." }, { status: 409 });
    }

    const docker = getDocker();
    const container = docker.getContainer(sandbox.containerId);
    // The command text is passed as one argument to a shell inside the sandbox, never interpolated
    // into the Docker API request itself. This endpoint is an admin-only remote shell by design.
    // `timeout` caps execution; the workspace is writable but the container root filesystem is not.
    const exec = await container.exec({
      Cmd: ["/usr/bin/timeout", "--signal=KILL", "15s", "/bin/sh", "-lc", parsed.data.command],
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      User: "10001:10001",
    });
    const stream = await exec.start({ hijack: true, stdin: false });
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    let stdoutText = "";
    let stderrText = "";
    let totalBytes = 0;
    let truncated = false;
    const capture = (target: "stdout" | "stderr") => (chunk: Buffer) => {
      const value = chunk.toString("utf8");
      const remaining = MAX_OUTPUT_BYTES - totalBytes;
      if (remaining <= 0) { truncated = true; return; }
      const clipped = value.slice(0, remaining);
      if (target === "stdout") stdoutText += clipped;
      else stderrText += clipped;
      totalBytes += Buffer.byteLength(clipped);
      if (clipped.length < value.length) truncated = true;
    };
    stdout.on("data", capture("stdout"));
    stderr.on("data", capture("stderr"));
    const completed = new Promise<void>((resolve, reject) => {
      stream.once("end", resolve);
      stream.once("close", resolve);
      stream.once("error", reject);
    });
    docker.modem.demuxStream(stream, stdout, stderr);

    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        completed,
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Command output stream timed out.")), 20_000); }),
      ]);
    } catch (error) {
      stream.destroy();
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }

    const inspected = await exec.inspect();
    await prisma.sandbox.update({ where: { id }, data: { lastCommandAt: new Date() } });
    await addSandboxEvent(id, "COMMAND_EXECUTED", "A command was executed in this sandbox.", {
      exitCode: inspected.ExitCode ?? null,
      timedOut: inspected.ExitCode === 124 || inspected.ExitCode === 137,
    });
    return NextResponse.json({
      stdout: stdoutText,
      stderr: stderrText,
      exitCode: inspected.ExitCode,
      timedOut: inspected.ExitCode === 124 || inspected.ExitCode === 137,
      truncated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to execute command.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
