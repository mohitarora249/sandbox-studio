import type Docker from "dockerode";
import { prisma } from "@/lib/prisma";
import { getDocker, errorMessage } from "@/lib/docker";
import { touchSandbox } from "@/lib/sandbox-service";

// API calls are not the only sign of use: a long build or a server left running inside the
// container is work the user cares about even if nobody has clicked anything for a while. This
// samples each running container's CPU and network counters once per reaper sweep and counts a
// sandbox as active when either rate was above its threshold since the previous sweep.

export type ActivityThresholds = {
  // Average CPU use, as a percentage of one core. The container's own `sleep` loop is ~0%.
  cpuPercent: number;
  // Combined rx + tx bytes per second across the container's networks.
  networkBytesPerSecond: number;
};

// Docker only exposes cumulative counters, so a rate needs the previous reading.
type Sample = { at: number; cpuNs: number; networkBytes: number };

// Kept on globalThis so baselines survive Next.js hot reloads. Each app instance keeps its own,
// which is fine: any instance seeing activity is enough to bump lastActivityAt.
const globalForSampler = globalThis as unknown as { sandboxActivitySamples?: Map<string, Sample> };
const samples = (globalForSampler.sandboxActivitySamples ??= new Map<string, Sample>());

function totalNetworkBytes(stats: Docker.ContainerStats) {
  // Containers created with networking disabled have no `networks` key at all.
  return Object.values(stats.networks ?? {}).reduce((sum, net) => sum + net.rx_bytes + net.tx_bytes, 0);
}

// Returns whether the container did enough work since the last sample to count as activity.
// The first sample for a container only sets the baseline, so it never counts.
async function sampleContainer(containerId: string, thresholds: ActivityThresholds) {
  // one-shot skips Docker's built-in 1s wait for a second CPU reading, which we don't need because
  // we compare against our own previous sample instead. That gives the average over the whole
  // sweep interval rather than a 1s snapshot that could land in a quiet moment of a build.
  const stats = await getDocker().getContainer(containerId).stats({ stream: false, "one-shot": true });
  const current: Sample = { at: Date.now(), cpuNs: stats.cpu_stats.cpu_usage.total_usage, networkBytes: totalNetworkBytes(stats) };
  const previous = samples.get(containerId);
  samples.set(containerId, current);

  // Counters reset when the container restarts; treat that like a first sample.
  if (!previous || current.cpuNs < previous.cpuNs || current.at <= previous.at) return false;

  const elapsedMs = current.at - previous.at;
  const cpuPercent = ((current.cpuNs - previous.cpuNs) / 1_000_000 / elapsedMs) * 100;
  const networkBytesPerSecond = Math.max(0, current.networkBytes - previous.networkBytes) / (elapsedMs / 1000);
  return cpuPercent >= thresholds.cpuPercent || networkBytesPerSecond >= thresholds.networkBytesPerSecond;
}

// Bumps lastActivityAt for every running sandbox whose container is busy. Run this before the idle
// checks in a sweep so a busy sandbox is never claimed for stopping in the same pass.
export async function recordWorkloadActivity(thresholds: ActivityThresholds) {
  const running = await prisma.sandbox.findMany({
    where: { status: "RUNNING", containerId: { not: null } },
    select: { id: true, containerId: true },
  });

  await Promise.all(running.map(async ({ id, containerId }) => {
    try {
      if (await sampleContainer(containerId!, thresholds)) await touchSandbox(id);
    } catch (error) {
      // A missing or unreachable container just isn't counted as active; syncSandboxStatus and the
      // reconciler deal with containers that have gone away.
      console.error(`[activity] Could not sample sandbox ${id}: ${errorMessage(error)}`);
    }
  }));

  // Forget containers that are no longer running so the map doesn't grow forever, and so a later
  // restart starts from a fresh baseline.
  const live = new Set(running.map((row) => row.containerId));
  for (const containerId of samples.keys()) if (!live.has(containerId)) samples.delete(containerId);
}
