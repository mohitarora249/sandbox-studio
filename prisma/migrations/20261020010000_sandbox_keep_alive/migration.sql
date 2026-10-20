-- Let users lease a sandbox so the idle reaper leaves it alone while work runs unattended.
ALTER TABLE "Sandbox" ADD COLUMN "keepAliveUntil" TIMESTAMP(3);

ALTER TYPE "SandboxEventType" ADD VALUE 'KEEP_ALIVE';
