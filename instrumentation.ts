// Next.js calls register() once per server process. The reaper needs Prisma and the Docker
// socket, so it only runs in the Node.js runtime. Keep the import inside this exact check:
// Next relies on it to drop the import from the Edge bundle.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startIdleReaper } = await import("@/lib/idle-reaper");
    startIdleReaper();
  }
}
