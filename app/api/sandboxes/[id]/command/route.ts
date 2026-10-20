import { PassThrough } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, hasValidOrigin } from "@/lib/auth";
import { commandSchema } from "@/lib/validation";
import { getSandbox, addSandboxEvent } from "@/lib/sandbox-service";
import { getDocker, killStrayProcesses } from "@/lib/docker";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };
const MAX_OUTPUT_BYTES = 24_000;
const COMMAND_TIMEOUT_MS = 15_000;

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
    // Anything the command detached escapes `timeout`, so strays are killed once the exec exits.
    const exec = await container.exec({
      Cmd: ["/usr/bin/timeout", "--signal=KILL", `${COMMAND_TIMEOUT_MS / 1000}s`, "/bin/sh", "-lc", parsed.data.command],
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      User: "10001:10001",
    });
    const startedAt = Date.now();
    const stream = await exec.start({ hijack: true, stdin: false });
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    // Collect raw bytes and decode once at the end: decoding each chunk on its own corrupts any
    // multi-byte UTF-8 character that straddles a chunk boundary.
    const chunks: Record<"stdout" | "stderr", Buffer[]> = { stdout: [], stderr: [] };
    const clippedStreams = new Set<"stdout" | "stderr">();
    let totalBytes = 0;
    let truncated = false;
    const capture = (target: "stdout" | "stderr") => (chunk: Buffer) => {
      const remaining = MAX_OUTPUT_BYTES - totalBytes;
      if (remaining <= 0) { truncated = true; return; }
      const clipped = chunk.subarray(0, remaining);
      chunks[target].push(clipped);
      totalBytes += clipped.length;
      if (clipped.length < chunk.length) { truncated = true; clippedStreams.add(target); }
    };
    const decode = (target: "stdout" | "stderr") => {
      const decoder = new StringDecoder("utf8");
      const text = decoder.write(Buffer.concat(chunks[target]));
      // write() holds back an incomplete trailing sequence. If the byte cap cut it, drop it rather
      // than emitting a replacement character; otherwise flush it as the command really wrote it.
      return clippedStreams.has(target) ? text : text + decoder.end();
    };
    stdout.on("data", capture("stdout"));
    stderr.on("data", capture("stderr"));
    const completed = new Promise<void>((resolve, reject) => {
      stream.once("end", resolve);
      stream.once("close", resolve);
      stream.once("error", reject);
    });
    docker.modem.demuxStream(stream, stdout, stderr);

    // A detached process that inherited stdout keeps the stream open after the shell exits, so wait
    // for the exec itself to finish rather than only for the stream to end.
    let timer: NodeJS.Timeout | undefined;
    let stopPolling = false;
    const execExited = (async () => {
      while (!stopPolling) {
        if (!(await exec.inspect()).Running) return;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    })();
    try {
      await Promise.race([
        completed,
        execExited,
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Command output stream timed out.")), 20_000); }),
      ]);
    } catch (error) {
      stream.destroy();
      throw error;
    } finally {
      stopPolling = true;
      if (timer) clearTimeout(timer);
      await killStrayProcesses(container).catch(() => undefined);
    }

    // With the strays gone the stream ends on its own; don't wait on it indefinitely if it doesn't.
    await Promise.race([completed, new Promise((resolve) => setTimeout(resolve, 2_000))]).catch(() => undefined);
    stream.destroy();

    const inspected = await exec.inspect();
    const exitCode = inspected.ExitCode ?? null;
    // `timeout --signal=KILL` exits 137 when it fires, but so does anything else that SIGKILLs the
    // command, most often the OOM killer. Only a kill after the full time limit can be the timeout.
    const timedOut = exitCode === 124 || (exitCode === 137 && Date.now() - startedAt >= COMMAND_TIMEOUT_MS);
    const killed = exitCode === 137 && !timedOut;
    // Running a command is real use, unlike viewing the sandbox, so it resets the idle timers.
    await prisma.sandbox.update({ where: { id }, data: { lastCommandAt: new Date(), lastActivityAt: new Date() } });
    await addSandboxEvent(id, "COMMAND_EXECUTED", "A command was executed in this sandbox.", {
      exitCode,
      timedOut,
      killed,
    });
    return NextResponse.json({
      stdout: decode("stdout"),
      stderr: decode("stderr"),
      exitCode,
      timedOut,
      killed,
      truncated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to execute command.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
