"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Box, CheckCircle2, CircleStop, Clock3, Copy, Cpu, FileCode2, Globe, HardDrive, LoaderCircle, Play, RefreshCw, ShieldCheck, Terminal, Trash2, WifiOff, XCircle, type LucideIcon } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, type SandboxStatus } from "@/components/status-badge";
import { formatBytesFromMb, formatDate } from "@/lib/utils";

type EventItem = { id: string; type: string; message: string; createdAt: string };
type Sandbox = {
  id: string; name: string; description: string | null; runtime: "NODE" | "PYTHON"; image: string;
  containerId: string | null; volumeName: string | null; status: SandboxStatus; cpuCores: number; memoryMb: number;
  networkEnabled: boolean; failureReason: string | null; lastCommandAt: string | null; startedAt: string | null;
  stoppedAt: string | null; createdAt: string; updatedAt: string; events: EventItem[];
};
type CommandResult = { stdout: string; stderr: string; exitCode: number | null; timedOut: boolean; truncated: boolean };

export function SandboxDetail({ id }: { id: string }) {
  const router = useRouter();
  const [sandbox, setSandbox] = useState<Sandbox | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logs, setLogs] = useState("");
  const [command, setCommand] = useState("");
  const [commandBusy, setCommandBusy] = useState(false);
  const [commandResult, setCommandResult] = useState<CommandResult | null>(null);
  const [commandError, setCommandError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/sandboxes/${id}`, { cache: "no-store" });
      if (response.status === 401) { window.location.href = "/login"; return; }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load sandbox.");
      setSandbox(payload.data as Sandbox);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load sandbox."); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  const sandboxRuntime = sandbox?.runtime;
  useEffect(() => { if (sandboxRuntime) setCommand(sandboxRuntime === "PYTHON" ? "python --version" : "node --version"); }, [sandboxRuntime]);

  async function performAction(action: "start" | "stop" | "delete") {
    if (action === "delete" && !window.confirm(`Delete “${sandbox?.name}”? Its container and persistent workspace files will be removed.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = action === "delete"
        ? await fetch(`/api/sandboxes/${id}`, { method: "DELETE" })
        : await fetch(`/api/sandboxes/${id}/${action}`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Could not ${action} sandbox.`);
      if (action === "delete") { router.push("/"); router.refresh(); return; }
      setNotice(action === "start" ? "Sandbox started." : "Sandbox stopped.");
      await load(true);
    } catch (err) { setError(err instanceof Error ? err.message : `Could not ${action} sandbox.`); }
    finally { setBusy(false); }
  }

  async function loadLogs() {
    setLogsLoading(true); setError("");
    try {
      const response = await fetch(`/api/sandboxes/${id}/logs`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not read logs.");
      setLogs(payload.logs || "No recent output.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not read logs."); }
    finally { setLogsLoading(false); }
  }

  async function runCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setCommandBusy(true); setCommandError(""); setCommandResult(null); setError("");
    try {
      const response = await fetch(`/api/sandboxes/${id}/command`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Command failed.");
      setCommandResult(payload as CommandResult);
      await load(true);
    } catch (err) { setCommandError(err instanceof Error ? err.message : "Command failed."); }
    finally { setCommandBusy(false); }
  }

  if (loading) return <div className="flex min-h-screen bg-slate-50"><AppSidebar/><main className="flex flex-1 items-center justify-center"><div className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin"/>Loading sandbox…</div></main></div>;
  if (!sandbox) return <div className="flex min-h-screen bg-slate-50"><AppSidebar/><main className="flex flex-1 flex-col items-center justify-center px-6"><XCircle className="h-8 w-8 text-red-500"/><h1 className="mt-3 text-lg font-semibold">Sandbox unavailable</h1><p className="mt-2 text-sm text-slate-500">{error || "This sandbox could not be found."}</p><Link href="/" className="mt-4 text-sm font-medium text-blue-700">Back to dashboard</Link></main></div>;

  const running = sandbox.status === "RUNNING";
  const deleted = sandbox.status === "DELETED";
  return (
    <div className="flex min-h-screen bg-slate-50/80">
      <AppSidebar />
      <main className="min-w-0 flex-1">
        <header className="flex h-[78px] items-center justify-between border-b border-slate-200/80 bg-white/80 px-5 backdrop-blur sm:px-8"><div className="min-w-0"><Link href="/" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5"/>All sandboxes</Link><div className="mt-1 truncate text-sm font-semibold text-slate-900">{sandbox.name}</div></div><div className="flex items-center gap-2"><Button variant="secondary" size="sm" onClick={() => void load(true)}><RefreshCw className="h-3.5 w-3.5"/><span className="hidden sm:inline">Refresh</span></Button>{!deleted && (running ? <Button size="sm" variant="secondary" onClick={() => void performAction("stop")} disabled={busy}><CircleStop className="h-3.5 w-3.5"/>Stop</Button> : <Button size="sm" onClick={() => void performAction("start")} disabled={busy}><Play className="h-3.5 w-3.5"/>Start</Button>)}</div></header>
        <div className="mx-auto max-w-[1350px] px-5 py-8 sm:px-8">
          <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2.5"><div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${sandbox.runtime === "NODE" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>{sandbox.runtime === "NODE" ? <Terminal className="h-5 w-5"/> : <FileCode2 className="h-5 w-5"/>}</div><h1 className="text-2xl font-semibold tracking-tight text-slate-950">{sandbox.name}</h1><StatusBadge status={sandbox.status}/></div><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">{sandbox.description || "No description added."}</p><div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-400"><span className="font-mono">ID {sandbox.id}</span><span className="flex items-center gap-1"><Clock3 className="h-3 w-3"/>Created {formatDate(sandbox.createdAt)}</span></div></div>
            {!deleted && <Button variant="destructive" size="sm" onClick={() => void performAction("delete")} disabled={busy}><Trash2 className="h-3.5 w-3.5"/>Delete sandbox</Button>}
          </div>
          {error && <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{error}</div>}
          {notice && <div role="status" className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4"/>{notice}</div>}
          {sandbox.failureReason && <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"><div className="text-xs font-semibold text-amber-900">Latest sandbox error</div><p className="mt-1 break-words text-xs leading-5 text-amber-800">{sandbox.failureReason}</p></div>}

          <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard icon={Cpu} label="CPU limit" value={`${sandbox.cpuCores} vCPU`} meta="Cgroup quota" />
            <SummaryCard icon={HardDrive} label="Memory limit" value={formatBytesFromMb(sandbox.memoryMb)} meta="Memory and swap capped" />
            <SummaryCard icon={sandbox.networkEnabled ? Globe : WifiOff} label="Network" value={sandbox.networkEnabled ? "Enabled" : "Disabled"} meta={sandbox.networkEnabled ? "Docker bridge networking" : "Isolated network namespace"} />
            <SummaryCard icon={Box} label="Runtime" value={sandbox.runtime === "NODE" ? "Node.js 22" : "Python 3.12"} meta={sandbox.image} />
          </div>

          <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
            <div className="space-y-5">
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6"><div><h2 className="text-sm font-semibold text-slate-900">Command console</h2><p className="mt-1 text-xs text-slate-500">Run a short command inside the sandbox.</p></div><Badge tone={running ? "success" : "muted"}>{running ? "Ready" : "Sandbox stopped"}</Badge></div>
                <div className="p-5 sm:p-6">
                  <div className="mb-3 rounded-xl border border-slate-200 bg-[#101827] px-3.5 py-3 font-mono text-[11px] leading-5 text-slate-300"><div className="mb-1 flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-400"/><span className="h-2 w-2 rounded-full bg-amber-400"/><span className="h-2 w-2 rounded-full bg-emerald-400"/><span className="ml-2 text-slate-500">/workspace</span></div><span className="text-emerald-400">sandbox@environment</span><span className="text-slate-500">:</span><span className="text-blue-300">/workspace</span><span className="text-slate-500">$ </span>{command}</div>
                  <form onSubmit={runCommand} className="flex flex-col gap-2 sm:flex-row"><Input value={command} onChange={(e) => setCommand(e.target.value)} placeholder={sandbox.runtime === "NODE" ? "node --version" : "python --version"} disabled={!running || commandBusy} aria-label="Command to run"/><Button type="submit" disabled={!running || commandBusy || !command.trim()} className="sm:min-w-[120px]">{commandBusy ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <Play className="h-4 w-4"/>}{commandBusy ? "Running…" : "Run command"}</Button></form>
                  <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-5 text-slate-400"><ShieldCheck className="mt-0.5 h-3 w-3 shrink-0"/>Commands run as UID 10001 and are terminated, along with anything they leave running in the background, after 15 seconds. Output is capped. This console is admin-only.</p>
                  {commandError && <div className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">{commandError}</div>}
                  {commandResult && <div className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-[#0c1422]"><div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2"><span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Command output</span><span className={`text-[10px] font-semibold ${commandResult.exitCode === 0 ? "text-emerald-400" : "text-amber-400"}`}>exit {commandResult.exitCode ?? "—"}{commandResult.timedOut ? " · timed out" : ""}</span></div><pre className="max-h-[330px] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-5 text-slate-200">{commandResult.stdout}{commandResult.stderr ? `\n[stderr]\n${commandResult.stderr}` : ""}{!commandResult.stdout && !commandResult.stderr ? "(no output)" : ""}{commandResult.truncated ? "\n… output truncated at 24 KB" : ""}</pre></div>}
                  {!running && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">Start this sandbox before running commands. Its workspace volume is preserved when stopped.</div>}
                </div>
              </Card>

              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6"><div><h2 className="text-sm font-semibold text-slate-900">Container logs</h2><p className="mt-1 text-xs text-slate-500">Most recent output from the container&apos;s main process.</p></div><Button variant="secondary" size="sm" onClick={() => void loadLogs()} disabled={logsLoading || deleted}><RefreshCw className={`h-3.5 w-3.5 ${logsLoading ? "animate-spin" : ""}`}/>Fetch logs</Button></div>
                <div className="min-h-[135px] bg-[#101827] p-4 sm:p-5"><pre className="max-h-[300px] overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-slate-300">{logs || "Click Fetch logs to retrieve the last 200 log lines."}</pre></div>
              </Card>
            </div>

            <div className="space-y-5">
              <Card className="p-5 sm:p-6"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600"/><h2 className="text-sm font-semibold text-slate-900">Isolation configuration</h2></div><div className="mt-4 space-y-3"><ConfigRow label="Run as non-root" value="UID / GID 10001"/><ConfigRow label="Root filesystem" value="Read-only"/><ConfigRow label="Linux capabilities" value="All dropped"/><ConfigRow label="Privilege escalation" value="Disabled"/><ConfigRow label="Process limit" value="128 PIDs"/><ConfigRow label="Writable path" value="/workspace only"/><ConfigRow label="Temporary storage" value="/tmp · 64 MB"/><ConfigRow label="Port publishing" value="None"/></div><div className="mt-4 rounded-lg bg-emerald-50 px-3 py-2.5 text-[10px] leading-5 text-emerald-800">Hardened for trusted local development, not a substitute for a VM or stronger sandbox runtime when executing hostile multi-tenant code.</div></Card>
              <Card className="p-5 sm:p-6"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-slate-500"/><h2 className="text-sm font-semibold text-slate-900">Lifecycle</h2></div><span className="text-[10px] text-slate-400">Recent events</span></div><div className="mt-4 space-y-4">{sandbox.events?.length ? sandbox.events.map((event) => <div key={event.id} className="flex gap-3"><div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><ActivityDot type={event.type}/></div><div className="min-w-0 flex-1"><div className="text-xs font-medium text-slate-800">{event.message}</div><div className="mt-1 text-[10px] text-slate-400">{formatDate(event.createdAt)}</div></div></div>) : <p className="text-xs text-slate-500">No lifecycle events have been recorded.</p>}</div></Card>
              {sandbox.containerId && <Card className="p-5 sm:p-6"><h2 className="text-sm font-semibold text-slate-900">Docker references</h2><div className="mt-4"><div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Container ID</div><div className="mt-1 break-all font-mono text-[10px] leading-5 text-slate-600">{sandbox.containerId}</div><Button variant="ghost" size="sm" className="mt-2 h-7 px-2 text-[10px]" onClick={() => void navigator.clipboard.writeText(sandbox.containerId || "")}><Copy className="h-3 w-3"/>Copy ID</Button></div><div className="mt-3 border-t border-slate-100 pt-3"><div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Workspace volume</div><div className="mt-1 break-all font-mono text-[10px] leading-5 text-slate-600">{sandbox.volumeName || "—"}</div></div></Card>}
              <Link href="/" className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"><span className="flex items-center gap-2"><Box className="h-4 w-4"/>Back to all environments</span><ArrowRight className="h-3.5 w-3.5"/></Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, meta }: { icon: LucideIcon; label: string; value: string; meta: string }) {
  return <Card className="p-4"><div className="flex items-center gap-2 text-slate-500"><Icon className="h-4 w-4"/><span className="text-[11px] font-medium">{label}</span></div><div className="mt-3 text-lg font-semibold tracking-tight text-slate-950">{value}</div><div className="mt-1 truncate text-[10px] text-slate-400" title={meta}>{meta}</div></Card>;
}
function ConfigRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2.5 last:border-0 last:pb-0"><span className="text-xs text-slate-500">{label}</span><span className="text-right text-xs font-medium text-slate-800">{value}</span></div>; }
function ActivityDot({ type }: { type: string }) {
  if (type === "FAILED") return <XCircle className="h-3.5 w-3.5 text-red-500"/>;
  if (type === "CREATED") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600"/>;
  if (type === "STARTED") return <Play className="h-3.5 w-3.5 text-blue-600"/>;
  if (type === "STOPPED") return <CircleStop className="h-3.5 w-3.5"/>;
  if (type === "COMMAND_EXECUTED") return <Terminal className="h-3.5 w-3.5 text-violet-600"/>;
  return <Box className="h-3.5 w-3.5"/>;
}
