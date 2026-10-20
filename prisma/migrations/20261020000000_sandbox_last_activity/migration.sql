-- Track last use so idle sandboxes can be destroyed automatically.
ALTER TABLE "Sandbox" ADD COLUMN "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Sandbox_status_lastActivityAt_idx" ON "Sandbox"("status", "lastActivityAt");
