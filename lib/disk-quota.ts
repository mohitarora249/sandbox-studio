import { prisma } from "@/lib/prisma";
import { getDocker, errorMessage } from "@/lib/docker";
import { DISK_QUOTA_BYTES, DISK_QUOTA_MB, stopOverQuotaSandbox } from "@/lib/sandbox-service";

// Docker's local volume driver can only enforce a size limit when its data root is on XFS mounted
// with project quotas, which rules out Docker Desktop and most ext4 hosts. So the quota is always
// enforced softly: each reaper sweep asks Docker how much each workspace volume holds and stops any
// running sandbox over the limit. A per-file size limit (see createSandbox) keeps a single runaway
// file from overshooting by much between sweeps; many smaller files can still overshoot by whatever
// is written in one sweep interval. Hosts that do support quotas can turn on SANDBOX_DISK_QUOTA_HARD
// so the kernel enforces the limit as well.

const BYTES_PER_MB = 1024 * 1024;

type VolumeUsage = { Name: string; UsageData?: { Size: number; RefCount: number } | null };

// Sizes come from dockerd, which walks the volume as root on the host. Measuring from inside the
// sandbox (e.g. `du` via exec) would let its processes hide files behind unreadable directories or
// kill the measuring process. dockerode's df() drops query options, so call the endpoint directly to
// limit it to volumes. Size is -1 when Docker could not compute it.
async function workspaceVolumeSizes() {
  const data = await new Promise<{ Volumes?: VolumeUsage[] | null }>((resolve, reject) => {
    getDocker().modem.dial(
      { path: "/system/df?", method: "GET", options: { type: "volume" }, statusCodes: { 200: true, 500: "server error" } },
      (error: unknown, result: unknown) => (error ? reject(error) : resolve(result as { Volumes?: VolumeUsage[] | null })),
    );
  });
  return new Map((data.Volumes ?? []).map((volume) => [volume.Name, volume.UsageData?.Size ?? -1]));
}

// Stops every running sandbox whose workspace volume is over DISK_QUOTA_BYTES. The workspace is
// kept, so the user can start the sandbox again and delete files; if it is still over the quota at
// the next sweep it is stopped again.
export async function enforceDiskQuotas() {
  const running = await prisma.sandbox.findMany({
    where: { status: "RUNNING", volumeName: { not: null } },
    select: { id: true, volumeName: true },
  });
  if (running.length === 0) return;

  const sizes = await workspaceVolumeSizes();
  for (const { id, volumeName } of running) {
    const usedBytes = sizes.get(volumeName!) ?? -1;
    if (usedBytes <= DISK_QUOTA_BYTES) continue;
    const usedMb = Math.ceil(usedBytes / BYTES_PER_MB);
    try {
      const stopped = await stopOverQuotaSandbox(
        id,
        `Sandbox stopped: its workspace uses ${usedMb} MB, over the ${DISK_QUOTA_MB} MB disk quota. Start it and delete files to get back under the limit.`,
        { usedMb, quotaMb: DISK_QUOTA_MB },
      );
      if (stopped) console.warn(`[disk-quota] Stopped sandbox ${id}: ${usedMb} MB used, quota ${DISK_QUOTA_MB} MB`);
    } catch (error) {
      // The row was put back to RUNNING, so the next sweep retries.
      console.error(`[disk-quota] Failed to stop over-quota sandbox ${id}: ${errorMessage(error)}`);
    }
  }
}
