"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Activity, ArrowRight, Check, Cpu, Info, Laptop, Network, ShieldCheck, TerminalSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export function SandboxCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [runtime, setRuntime] = useState<"NODE" | "PYTHON">("NODE");
  const [cpuCores, setCpuCores] = useState("0.5");
  const [memoryMb, setMemoryMb] = useState("512");
  const [networkEnabled, setNetworkEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setError("");
    try {
      const response = await fetch("/api/sandboxes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, runtime, cpuCores: Number(cpuCores), memoryMb: Number(memoryMb), networkEnabled }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not create sandbox.");
      router.push(`/sandboxes/${payload.data.id}`);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create sandbox."); }
    finally { setSubmitting(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card className="p-6 sm:p-7">
        <div className="flex items-start gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Laptop className="h-5 w-5"/></div><div><h2 className="text-base font-semibold text-slate-900">Environment details</h2><p className="mt-1 text-xs leading-5 text-slate-500">Name your environment and choose what will run inside it.</p></div></div>
        <div className="mt-6 space-y-5">
          <div><label htmlFor="name" className="field-label">Sandbox name <span className="text-red-500">*</span></label><Input id="name" placeholder="e.g. gmail-integration-dev" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={50} required/><p className="field-help">Use a memorable name. Letters, numbers, spaces, dots, underscores, and hyphens are accepted.</p></div>
          <div><label htmlFor="description" className="field-label">Description <span className="font-normal text-slate-400">(optional)</span></label><Textarea id="description" placeholder="What will you use this environment for?" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} className="min-h-[84px]"/></div>
          <div><label className="field-label">Runtime image</label><div className="grid gap-3 sm:grid-cols-2">
            <RuntimeOption selected={runtime === "NODE"} onClick={() => setRuntime("NODE")} icon={TerminalSquare} title="Node.js 22" version="sandbox-studio/node-runtime:22" detail="Node.js + npm" accent="emerald"/>
            <RuntimeOption selected={runtime === "PYTHON"} onClick={() => setRuntime("PYTHON")} icon={Activity} title="Python 3.12" version="sandbox-studio/python-runtime:3.12" detail="Python + pip" accent="blue"/>
          </div><p className="field-help">Only prebuilt, allowlisted images can be selected. Build them once with <code className="rounded bg-slate-100 px-1 py-0.5">npm run build:runtimes</code>.</p></div>
        </div>
      </Card>

      <Card className="p-6 sm:p-7">
        <div className="flex items-start gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><Cpu className="h-5 w-5"/></div><div><h2 className="text-base font-semibold text-slate-900">Resource limits</h2><p className="mt-1 text-xs leading-5 text-slate-500">Hard container limits apply while the sandbox is running.</p></div></div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div><label htmlFor="cpu" className="field-label">CPU limit</label><Select id="cpu" value={cpuCores} onChange={(e) => setCpuCores(e.target.value)}><option value="0.25">0.25 vCPU</option><option value="0.5">0.5 vCPU</option><option value="1">1 vCPU</option><option value="2">2 vCPU</option></Select><p className="field-help">Limits compute use; it does not reserve a dedicated core.</p></div>
          <div><label htmlFor="memory" className="field-label">Memory limit</label><Select id="memory" value={memoryMb} onChange={(e) => setMemoryMb(e.target.value)}><option value="256">256 MB</option><option value="512">512 MB</option><option value="1024">1 GB</option><option value="2048">2 GB</option></Select><p className="field-help">The container is killed if it exceeds its memory cgroup limit.</p></div>
        </div>
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between"><div className="flex items-start gap-3"><div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm"><Network className="h-4 w-4"/></div><div><div className="text-sm font-medium text-slate-800">Allow network access</div><div className="mt-1 max-w-lg text-xs leading-5 text-slate-500">Enable outbound networking for package installs and APIs. Disabled mode uses Docker&apos;s network namespace isolation (`none`).</div></div></div><Switch checked={networkEnabled} onChange={setNetworkEnabled} /></div>{networkEnabled && <div className="mt-3 flex gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-[11px] leading-5 text-amber-800"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0"/>Network-enabled containers may reach reachable hosts and public endpoints. Add explicit egress controls before running untrusted code.</div>}</div>
      </Card>

      <Card className="p-5 sm:p-6"><div className="flex items-start gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><ShieldCheck className="h-4 w-4"/></div><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-slate-900">Isolation profile</h3><p className="mt-1 text-xs leading-5 text-slate-500">The service will run as UID 10001, drop all Linux capabilities, disallow privilege escalation, set a PID limit, use a read-only root filesystem, and mount only its dedicated workspace volume as persistent writable storage.</p></div></div><div className="mt-4 flex flex-wrap gap-2"><SafetyPill>Non-root user</SafetyPill><SafetyPill>Read-only root</SafetyPill><SafetyPill>128 PID limit</SafetyPill><SafetyPill>{networkEnabled ? "Network enabled" : "Network disabled"}</SafetyPill></div></Card>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{error}</div>}
      <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row"><Link href="/" className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-600 transition hover:bg-slate-50">Cancel</Link><Button type="submit" size="lg" disabled={submitting} className="min-w-[180px]">{submitting ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"/>Creating sandbox…</> : <>Create sandbox <ArrowRight className="h-4 w-4"/></>}</Button></div>
    </form>
  );
}

function RuntimeOption({ selected, onClick, icon: Icon, title, version, detail, accent }: { selected: boolean; onClick: () => void; icon: typeof TerminalSquare; title: string; version: string; detail: string; accent: "emerald" | "blue" }) {
  return <button type="button" onClick={onClick} aria-pressed={selected} className={`relative rounded-xl border p-4 text-left transition ${selected ? "border-blue-400 bg-blue-50/50 ring-2 ring-blue-100" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60"}`}><div className="flex items-center gap-3"><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accent === "emerald" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}><Icon className="h-5 w-5"/></div><div><div className="text-sm font-semibold text-slate-900">{title}</div><div className="mt-0.5 text-xs text-slate-500">{detail}</div></div>{selected && <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white"><Check className="h-3 w-3"/></span>}</div><div className="mt-3 break-all font-mono text-[10px] leading-4 text-slate-500">{version}</div></button>;
}
function SafetyPill({ children }: { children: ReactNode }) { return <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-medium text-slate-600"><Check className="h-3 w-3 text-emerald-600"/>{children}</span>; }
