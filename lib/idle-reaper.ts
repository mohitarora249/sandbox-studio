import { prisma } from "@/lib/prisma";
import { deleteSandbox, stopSandbox } from "@/lib/sandbox-service";
import { errorMessage } from "@/lib/docker";

const DEFAULT_IDLE_STOP_MS = 5 * 60 * 1000;
const DEFAULT_IDLE_DESTROY_MS = 10 * 60 * 1000;
const DEFAULT_SWEEP_INTERVAL_MS = 30 * 1000;

function envMs(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// Both thresholds are measured from the sandbox's last activity, not from when it was stopped.
export const IDLE_STOP_MS = envMs("SANDBOX_IDLE_STOP_MS", DEFAULT_IDLE_STOP_MS);
export const IDLE_DESTROY_MS = envMs("SANDBOX_IDLE_DESTROY_MS", DEFAULT_IDLE_DESTROY_MS);
const SWEEP_INTERVAL_MS = envMs("SANDBOX_IDLE_SWEEP_INTERVAL_MS", DEFAULT_SWEEP_INTERVAL_MS);

function formatDuration(ms: number) {
  const [value, unit] = ms >= 60_000 ? [Math.round(ms / 60_000), "minute"] : [Math.round(ms / 1000), "second"];
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

// Destroys sandboxes (container + workspace volume) idle for IDLE_DESTROY_MS.
async function destroyIdleSandboxes() {
  const cutoff = new Date(Date.now() - IDLE_DESTROY_MS);
  const idle = await prisma.sandbox.findMany({
    where: { status: { in: ["RUNNING", "STOPPED"] }, lastActivityAt: { lt: cutoff } },
    select: { id: true },
  });

  for (const { id } of idle) {
    // Claim atomically so a request that just touched the sandbox, or another app instance, wins the race.
    const claimed = await prisma.sandbox.updateMany({
      where: { id, status: { in: ["RUNNING", "STOPPED"] }, lastActivityAt: { lt: cutoff } },
      data: { status: "DELETING" },
    });
    if (claimed.count === 0) continue;
    try {
      await deleteSandbox(id, `Sandbox destroyed after ${formatDuration(IDLE_DESTROY_MS)} of inactivity.`);
    } catch (error) {
      // deleteSandbox already marks the record FAILED with the reason; keep sweeping the rest.
      console.error(`[idle-reaper] Failed to destroy sandbox ${id}: ${errorMessage(error)}`);
    }
  }
}

// Stops running sandboxes idle for IDLE_STOP_MS. Their workspace is kept until the destroy threshold.
async function stopIdleSandboxes() {
  const cutoff = new Date(Date.now() - IDLE_STOP_MS);
  const idle = await prisma.sandbox.findMany({
    where: { status: "RUNNING", lastActivityAt: { lt: cutoff } },
    select: { id: true },
  });

  for (const { id } of idle) {
    // Re-check right before stopping in case the sandbox was used since the query above.
    const stillIdle = await prisma.sandbox.count({ where: { id, status: "RUNNING", lastActivityAt: { lt: cutoff } } });
    if (!stillIdle) continue;
    try {
      await stopSandbox(id, `Sandbox stopped after ${formatDuration(IDLE_STOP_MS)} of inactivity.`);
    } catch (error) {
      console.error(`[idle-reaper] Failed to stop sandbox ${id}: ${errorMessage(error)}`);
    }
  }
}

export async function reapIdleSandboxes() {
  await destroyIdleSandboxes();
  await stopIdleSandboxes();
}

const globalForReaper = globalThis as unknown as { sandboxIdleReaper?: NodeJS.Timeout };

export function startIdleReaper() {
  // Survive Next.js hot reloads without stacking up duplicate intervals.
  if (globalForReaper.sandboxIdleReaper) return;
  let running = false;
  globalForReaper.sandboxIdleReaper = setInterval(async () => {
    if (running) return;
    running = true;
    try { await reapIdleSandboxes(); }
    catch (error) { console.error(`[idle-reaper] Sweep failed: ${errorMessage(error)}`); }
    finally { running = false; }
  }, SWEEP_INTERVAL_MS);
  globalForReaper.sandboxIdleReaper.unref();
}
