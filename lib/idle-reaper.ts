import { prisma } from "@/lib/prisma";
import { deleteSandbox, failInterruptedProvisioning, stopSandbox } from "@/lib/sandbox-service";
import { errorMessage } from "@/lib/docker";

const DEFAULT_IDLE_STOP_MS = 5 * 60 * 1000;
const DEFAULT_IDLE_DESTROY_MS = 10 * 60 * 1000;
const DEFAULT_SWEEP_INTERVAL_MS = 30 * 1000;
const DEFAULT_STUCK_MS = 10 * 60 * 1000;

function envMs(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// Both thresholds are measured from the sandbox's last activity, not from when it was stopped.
export const IDLE_STOP_MS = envMs("SANDBOX_IDLE_STOP_MS", DEFAULT_IDLE_STOP_MS);
export const IDLE_DESTROY_MS = envMs("SANDBOX_IDLE_DESTROY_MS", DEFAULT_IDLE_DESTROY_MS);
const SWEEP_INTERVAL_MS = envMs("SANDBOX_IDLE_SWEEP_INTERVAL_MS", DEFAULT_SWEEP_INTERVAL_MS);
// PROVISIONING and DELETING normally last seconds. A row left in either for this long means the
// process handling it died, so the reaper finishes the job.
const STUCK_MS = envMs("SANDBOX_STUCK_MS", DEFAULT_STUCK_MS);

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

// Recovers sandboxes whose create or delete was interrupted: PROVISIONING rows are cleaned up and
// marked FAILED, DELETING rows have their delete finished.
async function recoverStuckSandboxes() {
  const cutoff = new Date(Date.now() - STUCK_MS);
  const stuck = await prisma.sandbox.findMany({
    where: { status: { in: ["PROVISIONING", "DELETING"] }, updatedAt: { lt: cutoff } },
    select: { id: true, status: true, updatedAt: true },
  });

  for (const { id, status, updatedAt } of stuck) {
    // Claim by bumping updatedAt, so another app instance skips this row and a failed attempt is
    // only retried after another STUCK_MS.
    const claimed = await prisma.sandbox.updateMany({
      where: { id, status, updatedAt },
      data: { updatedAt: new Date() },
    });
    if (claimed.count === 0) continue;
    try {
      if (status === "PROVISIONING") {
        await failInterruptedProvisioning(id, "Provisioning was interrupted before it finished; leftover resources were removed.");
      } else {
        await deleteSandbox(id, "Interrupted delete completed: sandbox container and workspace volume removed.");
      }
    } catch (error) {
      console.error(`[idle-reaper] Failed to recover sandbox ${id} stuck in ${status}: ${errorMessage(error)}`);
    }
  }
}

export async function reapIdleSandboxes() {
  await recoverStuckSandboxes();
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
