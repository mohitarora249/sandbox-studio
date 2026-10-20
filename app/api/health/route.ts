import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDocker } from "@/lib/docker";

export async function GET() {
  let database = "ok";
  let docker = "ok";
  try { await prisma.$queryRaw`SELECT 1`; } catch { database = "unavailable"; }
  try { await getDocker().ping(); } catch { docker = "unavailable"; }
  const ok = database === "ok" && docker === "ok";
  return NextResponse.json({ ok, database, docker, timestamp: new Date().toISOString() }, { status: ok ? 200 : 503 });
}
