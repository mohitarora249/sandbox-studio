import { z } from "zod";

export const createSandboxSchema = z.object({
  name: z.string().trim().min(2, "Use at least 2 characters").max(50, "Name must be 50 characters or fewer")
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9 ._-]*$/, "Start with a letter/number; use only letters, numbers, spaces, dots, underscores, and hyphens"),
  description: z.string().trim().max(500, "Description must be 500 characters or fewer").optional().default(""),
  runtime: z.enum(["NODE", "PYTHON"]),
  cpuCores: z.number().refine((value) => [0.25, 0.5, 1, 2].includes(value), "Choose a supported CPU limit"),
  memoryMb: z.number().int().refine((value) => [256, 512, 1024, 2048].includes(value), "Choose a supported memory limit"),
  networkEnabled: z.boolean().default(false),
});

export const commandSchema = z.object({
  command: z.string().trim().min(1, "Enter a command").max(2000, "Command must be 2,000 characters or fewer")
    .refine((value) => !value.includes("\u0000"), "Null bytes are not allowed"),
});

// Leases can be renewed as often as needed, but each one is capped so a forgotten sandbox still gets
// cleaned up eventually.
export const MAX_KEEP_ALIVE_MINUTES = 24 * 60;

export const keepAliveSchema = z.object({
  minutes: z.number().int("Minutes must be a whole number").min(1, "Keep alive for at least 1 minute")
    .max(MAX_KEEP_ALIVE_MINUTES, `Keep alive for at most ${MAX_KEEP_ALIVE_MINUTES / 60} hours at a time`),
});

export type CreateSandboxInput = z.infer<typeof createSandboxSchema>;
