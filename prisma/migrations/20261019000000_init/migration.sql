-- Initial schema for Sandbox Studio. Prisma maintains this migration going forward.
CREATE TYPE "SandboxRuntime" AS ENUM ('NODE', 'PYTHON');
CREATE TYPE "SandboxStatus" AS ENUM ('PROVISIONING', 'RUNNING', 'STOPPED', 'FAILED', 'DELETING', 'DELETED');
CREATE TYPE "SandboxEventType" AS ENUM ('CREATED', 'STARTED', 'STOPPED', 'DELETED', 'COMMAND_EXECUTED', 'FAILED');

CREATE TABLE "Sandbox" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "runtime" "SandboxRuntime" NOT NULL,
    "image" TEXT NOT NULL,
    "containerId" TEXT,
    "volumeName" TEXT,
    "status" "SandboxStatus" NOT NULL DEFAULT 'PROVISIONING',
    "cpuCores" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "memoryMb" INTEGER NOT NULL DEFAULT 512,
    "networkEnabled" BOOLEAN NOT NULL DEFAULT false,
    "failureReason" TEXT,
    "lastCommandAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Sandbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SandboxEvent" (
    "id" TEXT NOT NULL,
    "sandboxId" TEXT NOT NULL,
    "type" "SandboxEventType" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SandboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Sandbox_containerId_key" ON "Sandbox"("containerId");
CREATE UNIQUE INDEX "Sandbox_volumeName_key" ON "Sandbox"("volumeName");
CREATE INDEX "Sandbox_status_createdAt_idx" ON "Sandbox"("status", "createdAt");
CREATE INDEX "Sandbox_createdAt_idx" ON "Sandbox"("createdAt");
CREATE INDEX "SandboxEvent_sandboxId_createdAt_idx" ON "SandboxEvent"("sandboxId", "createdAt");
ALTER TABLE "SandboxEvent" ADD CONSTRAINT "SandboxEvent_sandboxId_fkey" FOREIGN KEY ("sandboxId") REFERENCES "Sandbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
