import { PassThrough, Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSandbox } from "@/lib/sandbox-service";
import { getDocker } from "@/lib/docker";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  try {
    const sandbox = await getSandbox(id);
    if (!sandbox) return NextResponse.json({ error: "Sandbox not found." }, { status: 404 });
    if (!sandbox.containerId || sandbox.status === "DELETED") return NextResponse.json({ logs: "No container is available for this sandbox." });

    // With follow:false, Dockerode returns the completed log payload as a Buffer,
    // not a live Node.js stream. Wrap it in Readable so demuxStream can decode
    // Docker's stdout/stderr multiplexing headers using its normal stream API.
    const logBuffer = await getDocker().getContainer(sandbox.containerId).logs({
      stdout: true, stderr: true, timestamps: true, follow: false, tail: 200,
    });
    const stream = Readable.from([logBuffer]);
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    let result = "";
    const append = (prefix: string) => (chunk: Buffer) => {
      if (result.length < 24_000) result += `${prefix}${chunk.toString("utf8")}`.slice(0, 24_000 - result.length);
    };
    stdout.on("data", append(""));
    stderr.on("data", append(""));
    const completed = new Promise<void>((resolve, reject) => {
      stream.once("end", resolve);
      stream.once("close", resolve);
      stream.once("error", reject);
    });
    getDocker().modem.demuxStream(stream, stdout, stderr);
    await completed;
    return NextResponse.json({ logs: result || "No recent container output." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read logs.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
