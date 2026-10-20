import { Prisma, SandboxEventType, SandboxRuntime, SandboxStatus, type Sandbox } from "@/generated/prisma/client";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDocker, RUNTIME_IMAGES, errorMessage } from "@/lib/docker";
import type { CreateSandboxInput } from "@/lib/validation";

const BYTES_PER_MB = 1024 * 1024;

export async function addSandboxEvent(
  sandboxId: string,
  type: SandboxEventType,
  message: string,
  metadata?: Prisma.InputJsonValue,
) {
  return prisma.sandboxEvent.create({
    data: { sandboxId, type, message, ...(metadata ? { metadata } : {}) },
  });
}

// Record that the sandbox is in use so the idle reaper leaves it alone.
export async function touchSandbox(id: string) {
  await prisma.sandbox.update({ where: { id }, data: { lastActivityAt: new Date() } });
}

function isNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "statusCode" in error && (error as { statusCode?: number }).statusCode === 404;
}

// Ask Docker for the actual state, so the dashboard doesn't rely solely on a possibly stale DB status.
// DELETING is skipped on purpose: a live container would flip it back to RUNNING mid-delete. Rows
// stuck in DELETING or PROVISIONING are recovered by the idle reaper instead.
export async function syncSandboxStatus(sandbox: Sandbox): Promise<Sandbox> {
  if (!sandbox.containerId || sandbox.status === "DELETED" || sandbox.status === "DELETING") return sandbox;
  try {
    const info = await getDocker().getContainer(sandbox.containerId).inspect();
    const nextStatus: SandboxStatus = info.State.Running
      ? "RUNNING"
      : info.State.OOMKilled
        ? "FAILED"
        : (info.State.Status === "exited" || info.State.Status === "created")
          ? "STOPPED"
          : "FAILED";
    if (nextStatus === sandbox.status) return sandbox;
    return await prisma.sandbox.update({
      where: { id: sandbox.id },
      data: {
        status: nextStatus,
        ...(nextStatus === "STOPPED" ? { stoppedAt: new Date() } : {}),
        ...(nextStatus === "RUNNING" ? { failureReason: null, startedAt: new Date(), stoppedAt: null } : {}),
        ...(info.State.OOMKilled ? { failureReason: "Container was killed for exceeding its memory limit (OOM)." } : {}),
      },
    });
  } catch (error) {
    // Docker may be temporarily unavailable; don't mark every environment failed in that case.
    if (!isNotFound(error)) return sandbox;
    return await prisma.sandbox.update({
      where: { id: sandbox.id },
      data: { status: "FAILED", failureReason: "The Docker container no longer exists. Delete this record or recreate the environment." },
    });
  }
}

export async function listSandboxes() {
  const rows = await prisma.sandbox.findMany({
    where: { status: { not: "DELETED" } },
    orderBy: { createdAt: "desc" },
  });
  return Promise.all(rows.map((row) => syncSandboxStatus(row)));
}

// Every per-sandbox API call (view, logs, command) goes through here, so reading counts as activity.
export async function getSandbox(id: string) {
  const row = await prisma.sandbox.findUnique({ where: { id }, include: { events: { orderBy: { createdAt: "desc" }, take: 20 } } });
  if (!row) return null;
  if (row.status !== "DELETED" && row.status !== "DELETING") await touchSandbox(id);
  const synced = await syncSandboxStatus(row);
  return { ...synced, events: row.events };
}

export async function createSandbox(input: CreateSandboxInput) {
  const image = RUNTIME_IMAGES[input.runtime as keyof typeof RUNTIME_IMAGES];
  const idSafe = `ss-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const volumeName = `${idSafe}-workspace`;
  const dbRecord = await prisma.sandbox.create({
    data: {
      name: input.name,
      description: input.description || null,
      runtime: input.runtime as SandboxRuntime,
      image,
      status: "PROVISIONING",
      cpuCores: input.cpuCores,
      memoryMb: input.memoryMb,
      networkEnabled: input.networkEnabled,
      volumeName,
    },
  });

  let createdContainerId: string | null = null;
  try {
    const docker = getDocker();
    // Runtime images are built by the operator during setup; we don't pull arbitrary images from user input.
    await docker.getImage(image).inspect();
    await docker.createVolume({
      Name: volumeName,
      Labels: { "sandbox-studio.managed": "true", "sandbox-studio.sandbox-id": dbRecord.id },
    });

    const container = await docker.createContainer({
      Image: image,
      name: `${idSafe}-${dbRecord.id.slice(-6)}`,
      WorkingDir: "/workspace",
      User: "10001:10001",
      Cmd: ["sh", "-lc", "mkdir -p /workspace/.home /workspace/.cache/pip /workspace/.local && while true; do sleep 3600; done"],
      Env: ["HOME=/workspace/.home", "TMPDIR=/tmp"],
      Labels: {
        "sandbox-studio.managed": "true",
        "sandbox-studio.sandbox-id": dbRecord.id,
        "sandbox-studio.runtime": input.runtime,
      },
      HostConfig: {
        // Hard limits are enforced by cgroups. Users can only select from a small allowlist.
        NanoCpus: Math.round(input.cpuCores * 1_000_000_000),
        Memory: input.memoryMb * BYTES_PER_MB,
        MemorySwap: input.memoryMb * BYTES_PER_MB,
        PidsLimit: 128,
        Init: true,
        ReadonlyRootfs: true,
        CapDrop: ["ALL"],
        SecurityOpt: ["no-new-privileges:true"],
        NetworkMode: input.networkEnabled ? "bridge" : "none",
        RestartPolicy: { Name: "unless-stopped" },
        Mounts: [{ Type: "volume", Source: volumeName, Target: "/workspace" }],
        Tmpfs: { "/tmp": "rw,nosuid,nodev,noexec,size=64m,uid=10001,gid=10001,mode=1777" },
        LogConfig: { Type: "json-file", Config: { "max-size": "10m", "max-file": "3" } },
      },
    });
    createdContainerId = container.id;
    await container.start();

    const updated = await prisma.sandbox.update({
      where: { id: dbRecord.id },
      data: { containerId: container.id, status: "RUNNING", startedAt: new Date(), lastActivityAt: new Date(), failureReason: null },
    });
    await addSandboxEvent(updated.id, "CREATED", "Sandbox created and started.", {
      image, cpuCores: input.cpuCores, memoryMb: input.memoryMb,
      networkEnabled: input.networkEnabled,
    });
    return updated;
  } catch (error) {
    // Best-effort cleanup avoids leaving orphaned containers if provisioning fails halfway through.
    if (createdContainerId) {
      try { await getDocker().getContainer(createdContainerId).remove({ force: true, v: true }); } catch { /* cleanup is best-effort */ }
    }
    try { await getDocker().getVolume(volumeName).remove(); } catch { /* volume may not have been created */ }
    const message = errorMessage(error).slice(0, 1000);
    await prisma.sandbox.update({
      where: { id: dbRecord.id },
      data: { status: "FAILED", containerId: null, volumeName: null, failureReason: message },
    });
    await addSandboxEvent(dbRecord.id, "FAILED", "Sandbox provisioning failed.", { reason: message });
    throw new Error(message.includes("No such image") || message.includes("not found")
      ? `Runtime image ${image} is missing. Build the runtime images first (see README.md).`
      : `Could not create sandbox: ${message}`);
  }
}

export async function requireSandboxWithContainer(id: string) {
  const sandbox = await prisma.sandbox.findUnique({ where: { id } });
  if (!sandbox) return { sandbox: null, container: null };
  if (!sandbox.containerId || sandbox.status === "DELETED") return { sandbox, container: null };
  return { sandbox, container: getDocker().getContainer(sandbox.containerId) };
}

export async function startSandbox(id: string) {
  const { sandbox, container } = await requireSandboxWithContainer(id);
  if (!sandbox) throw new Error("Sandbox not found.");
  if (sandbox.status === "DELETED") throw new Error("This sandbox has been deleted.");
  if (!container) throw new Error("No Docker container is attached to this sandbox. Delete the failed record and create it again.");
  await container.start().catch((error: unknown) => {
    if (!(typeof error === "object" && error !== null && "statusCode" in error && (error as { statusCode?: number }).statusCode === 304)) throw error;
  });
  const updated = await prisma.sandbox.update({ where: { id }, data: { status: "RUNNING", startedAt: new Date(), lastActivityAt: new Date(), stoppedAt: null, failureReason: null } });
  await addSandboxEvent(id, "STARTED", "Sandbox started.");
  return updated;
}

// `idleReason` marks an automatic stop by the idle reaper, which must not count as activity.
export async function stopSandbox(id: string, idleReason?: string) {
  const { sandbox, container } = await requireSandboxWithContainer(id);
  if (!sandbox) throw new Error("Sandbox not found.");
  if (sandbox.status === "DELETED") throw new Error("This sandbox has been deleted.");
  if (container) {
    await container.stop({ t: 5 }).catch((error: unknown) => {
      if (!(typeof error === "object" && error !== null && "statusCode" in error && [304, 404].includes(Number((error as { statusCode?: number }).statusCode)))) throw error;
    });
  }
  const updated = await prisma.sandbox.update({
    where: { id },
    data: { status: "STOPPED", stoppedAt: new Date(), ...(idleReason ? {} : { lastActivityAt: new Date() }) },
  });
  await addSandboxEvent(id, "STOPPED", idleReason ?? "Sandbox stopped.");
  return updated;
}

// Removes the sandbox's container(s) and workspace volume; already-missing resources are fine.
// Containers are also found by label, since a crash mid-provisioning can leave one that was never
// recorded in containerId. Containers go first because Docker won't remove a volume still in use.
async function removeSandboxResources(sandbox: Pick<Sandbox, "id" | "containerId" | "volumeName">) {
  const docker = getDocker();
  const labeled = await docker.listContainers({ all: true, filters: { label: [`sandbox-studio.sandbox-id=${sandbox.id}`] } });
  const containerIds = new Set([...(sandbox.containerId ? [sandbox.containerId] : []), ...labeled.map((c) => c.Id)]);
  for (const containerId of containerIds) {
    try { await docker.getContainer(containerId).remove({ force: true, v: false }); }
    catch (error) { if (!isNotFound(error)) throw error; }
  }
  if (sandbox.volumeName) {
    try { await docker.getVolume(sandbox.volumeName).remove(); }
    catch (error) { if (!isNotFound(error)) throw error; }
  }
}

// A Docker resource is accounted for while its row is mid-create or mid-delete (those flows own their
// resources), or when the row records it as its own. Anything else labelled as ours is an orphan.
function ownsResource(row: Sandbox | undefined, matches: (row: Sandbox) => boolean) {
  return !!row && (row.status === "PROVISIONING" || row.status === "DELETING" || matches(row));
}

// Brings Docker and the database back in line, in both directions:
// - containers and volumes labelled sandbox-studio.managed=true that no live row owns (row missing,
//   DELETED, or pointing at a different resource) are removed;
// - RUNNING/STOPPED rows whose container is gone are re-synced, which marks them FAILED so the idle
//   reaper later destroys them.
// Resources younger than minAgeMs are skipped so a row being written by another instance isn't raced.
export async function reconcileDockerResources(minAgeMs: number) {
  const docker = getDocker();
  const managed = { label: ["sandbox-studio.managed=true"] };
  // List Docker before reading rows: createSandbox writes its row before creating resources, so every
  // resource listed here already has its row visible below.
  const containers = await docker.listContainers({ all: true, filters: managed });
  const { Volumes: volumes } = await docker.listVolumes({ filters: managed });
  const rows = await prisma.sandbox.findMany({ where: { status: { not: "DELETED" } } });
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const cutoff = Date.now() - minAgeMs;

  for (const container of containers) {
    if (container.Created * 1000 > cutoff) continue;
    const row = rowsById.get(container.Labels["sandbox-studio.sandbox-id"]);
    if (ownsResource(row, (r) => r.containerId === container.Id)) continue;
    try {
      await docker.getContainer(container.Id).remove({ force: true, v: false });
      console.warn(`[reconcile] Removed orphaned container ${container.Id}`);
    } catch (error) {
      if (!isNotFound(error)) console.error(`[reconcile] Failed to remove orphaned container ${container.Id}: ${errorMessage(error)}`);
    }
  }

  // Volumes go after containers, since Docker won't remove a volume an orphaned container still uses.
  for (const volume of volumes ?? []) {
    // CreatedAt is returned by the Docker API but missing from the dockerode types.
    const createdAt = Date.parse((volume as { CreatedAt?: string }).CreatedAt ?? "");
    if (createdAt > cutoff) continue;
    const row = rowsById.get(volume.Labels?.["sandbox-studio.sandbox-id"]);
    if (ownsResource(row, (r) => r.volumeName === volume.Name)) continue;
    try {
      await docker.getVolume(volume.Name).remove();
      console.warn(`[reconcile] Removed orphaned volume ${volume.Name}`);
    } catch (error) {
      if (!isNotFound(error)) console.error(`[reconcile] Failed to remove orphaned volume ${volume.Name}: ${errorMessage(error)}`);
    }
  }

  const liveContainerIds = new Set(containers.map((container) => container.Id));
  for (const row of rows) {
    if ((row.status !== "RUNNING" && row.status !== "STOPPED") || !row.containerId || liveContainerIds.has(row.containerId)) continue;
    // syncSandboxStatus inspects the container itself, so one created after the listing above is
    // not mistaken for missing.
    await syncSandboxStatus(row);
  }
}

// Cleans up after a createSandbox call that never finished (e.g. the server crashed mid-way) and
// marks the record FAILED, mirroring createSandbox's own failure path. Throws if cleanup fails,
// leaving the record PROVISIONING so the reaper retries later.
export async function failInterruptedProvisioning(id: string, reason: string) {
  const sandbox = await prisma.sandbox.findUnique({ where: { id } });
  if (!sandbox || sandbox.status !== "PROVISIONING") return;
  await removeSandboxResources(sandbox);
  await prisma.sandbox.update({
    where: { id },
    data: { status: "FAILED", containerId: null, volumeName: null, failureReason: reason },
  });
  await addSandboxEvent(id, "FAILED", "Sandbox provisioning failed.", { reason });
}

export async function deleteSandbox(id: string, eventMessage = "Sandbox container and workspace volume removed.") {
  const sandbox = await prisma.sandbox.findUnique({ where: { id } });
  if (!sandbox) throw new Error("Sandbox not found.");
  if (sandbox.status === "DELETED") return sandbox;
  await prisma.sandbox.update({ where: { id }, data: { status: "DELETING" } });
  try {
    await removeSandboxResources(sandbox);
  } catch (error) {
    // Stay in DELETING rather than FAILED: the container may still be running (with unless-stopped),
    // and DELETING rows are retried after SANDBOX_STUCK_MS rather than waiting out the idle timer.
    const reason = `Delete failed: ${errorMessage(error)}`.slice(0, 1000);
    await prisma.sandbox.update({ where: { id }, data: { failureReason: reason } });
    await addSandboxEvent(id, "FAILED", "Sandbox delete failed; it will be retried automatically.", { reason });
    throw error;
  }
  const updated = await prisma.sandbox.update({
    where: { id },
    data: { status: "DELETED", containerId: null, volumeName: null, stoppedAt: new Date(), failureReason: null },
  });
  await addSandboxEvent(id, "DELETED", eventMessage);
  return updated;
}

export function requestOriginAllowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).origin === request.nextUrl.origin; } catch { return false; }
}
