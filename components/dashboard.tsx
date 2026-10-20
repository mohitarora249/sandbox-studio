"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowDownRight, ArrowRight, Box, Boxes, CircleCheck, Clock3, Cpu, Database, Plus, RefreshCw, ShieldCheck, TerminalSquare, type LucideIcon } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge, type SandboxStatus } from "@/components/status-badge";
import { formatBytesFromMb, formatDate } from "@/lib/utils";

type Sandbox = {
  id: string; name: string; description: string | null; runtime: "NODE" | "PYTHON"; image: string;
  status: SandboxStatus; cpuCores: number; memoryMb: number; networkEnabled: boolean; createdAt: string; lastCommandAt: string | null;
};

export function Dashboard() {
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/sandboxes", { cache: "no-store" });
      if (response.status === 401) { window.location.href = "/login"; return; }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load sandboxes.");
      setSandboxes(payload.data as Sandbox[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load sandboxes.");
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const running = sandboxes.filter((item) => item.status === "RUNNING").length;
  const stopped = sandboxes.filter((item) => item.status === "STOPPED").length;
  const memory = sandboxes.filter((item) => item.status === "RUNNING").reduce((sum, item) => sum + item.memoryMb, 0);

  return (
    <div className="flex min-h-screen bg-slate-50/80">
      <AppSidebar />
      <main className="min-w-0 flex-1">
        <header className="flex h-[78px] items-center justify-between border-b border-slate-200/80 bg-white/80 px-5 backdrop-blur sm:px-8">
          <div><p className="text-xs font-medium text-slate-500">Workspace / <span className="text-slate-800">Overview</span></p><h1 className="mt-1 text-sm font-semibold text-slate-900">Environment overview</h1></div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="secondary" size="sm" onClick={() => void load(true)} disabled={refreshing}><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> <span className="hidden sm:inline">Refresh</span></Button>
            <Link href="/sandboxes/new" className="inline-flex h-9 items-center gap-2 rounded-xl bg-blue-600 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"><Plus className="h-4 w-4" /><span className="hidden sm:inline">New sandbox</span><span className="sm:hidden">New</span></Link>
          </div>
        </header>

        <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div><p className="eyebrow">Workspace dashboard</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-[28px]">Your environments, at a glance.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Provision clean runtimes for experiments, code execution, and integration development — each with its own resource limits.</p></div>
            <div className="flex items-center gap-2 text-xs text-slate-500"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50"/><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"/></span>Control plane ready</div>
          </div>

          {error && <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={Boxes} label="Total environments" value={loading ? "—" : String(sandboxes.length)} hint="All provisioned sandboxes" iconTone="blue" />
            <Metric icon={CircleCheck} label="Running now" value={loading ? "—" : String(running)} hint={`${stopped} stopped and ready`} iconTone="green" />
            <Metric icon={Cpu} label="Allocated memory" value={loading ? "—" : formatBytesFromMb(memory)} hint="Sum of running sandbox limits" iconTone="violet" />
            <Metric icon={ShieldCheck} label="Default isolation" value="Hardened" hint="Non-root · no network by default" iconTone="amber" />
          </div>

          <Card className="mt-8 overflow-hidden" id="sandboxes">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div><div className="flex items-center gap-2"><h3 className="text-base font-semibold text-slate-900">Sandbox environments</h3><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{loading ? "…" : sandboxes.length}</span></div><p className="mt-1 text-xs text-slate-500">Each environment owns a Docker container and a workspace volume.</p></div>
              <Link href="/sandboxes/new" className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 transition hover:text-blue-900">Provision environment <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
            {loading ? <LoadingRows /> : sandboxes.length === 0 ? <EmptyState /> : <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead><tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500"><th className="px-6 py-3.5">Environment</th><th className="px-4 py-3.5">Runtime</th><th className="px-4 py-3.5">Resources</th><th className="px-4 py-3.5">Network</th><th className="px-4 py-3.5">Status</th><th className="px-6 py-3.5 text-right">Created</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {sandboxes.map((sandbox) => <tr key={sandbox.id} className="group transition hover:bg-slate-50/80">
                    <td className="px-6 py-4"><Link href={`/sandboxes/${sandbox.id}`} className="flex items-center gap-3"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${sandbox.runtime === "NODE" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>{sandbox.runtime === "NODE" ? <TerminalSquare className="h-4 w-4" /> : <Activity className="h-4 w-4" />}</div><div className="min-w-0"><div className="max-w-[270px] truncate text-sm font-semibold text-slate-900 group-hover:text-blue-700">{sandbox.name}</div><div className="mt-1 max-w-[290px] truncate text-xs text-slate-500">{sandbox.description || "No description"}</div></div></Link></td>
                    <td className="px-4 py-4"><span className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">{sandbox.runtime === "NODE" ? "Node.js 22" : "Python 3.12"}</span></td>
                    <td className="px-4 py-4"><div className="text-xs font-medium text-slate-700">{sandbox.cpuCores} vCPU</div><div className="mt-1 text-[11px] text-slate-500">{formatBytesFromMb(sandbox.memoryMb)} RAM</div></td>
                    <td className="px-4 py-4"><span className={`inline-flex items-center gap-1.5 text-xs ${sandbox.networkEnabled ? "text-amber-700" : "text-slate-500"}`}><span className={`h-1.5 w-1.5 rounded-full ${sandbox.networkEnabled ? "bg-amber-500" : "bg-slate-400"}`} />{sandbox.networkEnabled ? "Enabled" : "Disabled"}</span></td>
                    <td className="px-4 py-4"><StatusBadge status={sandbox.status} /></td>
                    <td className="px-6 py-4 text-right"><Link href={`/sandboxes/${sandbox.id}`} className="text-xs font-medium text-slate-500 hover:text-blue-700">{formatDate(sandbox.createdAt)} <ArrowRight className="ml-1 inline h-3 w-3 opacity-0 transition group-hover:opacity-100" /></Link></td>
                  </tr>)}
                </tbody>
              </table>
            </div>}
          </Card>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <InfoTile icon={ShieldCheck} title="Isolation by default" text="Non-root runtime, read-only root filesystem, dropped Linux capabilities, PID limits, and no network access unless you enable it." />
            <InfoTile icon={Database} title="Persistent workspace" text="Files under /workspace survive stop/start because each sandbox has its own Docker named volume." />
            <InfoTile icon={Clock3} title="Built for local development" text="The control plane manages container lifecycle. For hostile multi-tenant workloads, move execution to a stronger isolation tier." />
          </div>
          <footer className="mt-8 flex flex-col gap-2 border-t border-slate-200/80 py-5 text-[11px] text-slate-400 sm:flex-row sm:items-center sm:justify-between"><span>Sandbox Studio · Local-first sandbox control plane</span><span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Docker access is restricted to the admin session</span></footer>
        </div>
      </main>
    </div>
  );
}

function Metric({ icon: Icon, label, value, hint, iconTone }: { icon: LucideIcon; label: string; value: string; hint: string; iconTone: "blue" | "green" | "violet" | "amber" }) {
  const tones = { blue: "bg-blue-50 text-blue-700", green: "bg-emerald-50 text-emerald-700", violet: "bg-violet-50 text-violet-700", amber: "bg-amber-50 text-amber-700" };
  return <Card className="p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-slate-500">{label}</p><div className="mt-3 text-[28px] font-semibold tracking-tight text-slate-950">{value}</div></div><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[iconTone]}`}><Icon className="h-[18px] w-[18px]" /></div></div><div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500"><ArrowDownRight className="h-3 w-3 text-slate-400" />{hint}</div></Card>;
}

function LoadingRows() {
  return <div className="space-y-3 p-6">{[1, 2, 3].map((n) => <div key={n} className="flex animate-pulse items-center gap-4 py-2"><div className="h-9 w-9 rounded-xl bg-slate-100"/><div className="flex-1"><div className="h-3 w-40 rounded bg-slate-100"/><div className="mt-2 h-2.5 w-56 rounded bg-slate-100"/></div><div className="h-6 w-20 rounded-full bg-slate-100"/></div>)}</div>;
}

function EmptyState() {
  return <div className="flex flex-col items-center px-6 py-14 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Box className="h-6 w-6"/></div><h4 className="mt-4 text-base font-semibold text-slate-900">Your workspace is ready</h4><p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Create your first sandbox to get a dedicated runtime with resource limits and its own persistent workspace.</p><Link href="/sandboxes/new" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"><Plus className="h-4 w-4"/>Create first sandbox</Link></div>;
}

function InfoTile({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return <div className="flex gap-3 rounded-2xl border border-slate-200/80 bg-white p-4"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Icon className="h-4 w-4"/></div><div><h4 className="text-xs font-semibold text-slate-800">{title}</h4><p className="mt-1.5 text-[11px] leading-5 text-slate-500">{text}</p></div></div>;
}
