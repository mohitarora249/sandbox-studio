"use client";
import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Box, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true); setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Sign-in failed.");
      const nextPath = searchParams.get("next");
      // Only allow local absolute paths to avoid an open-redirect vulnerability.
      router.replace(nextPath?.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Sign-in failed."); }
    finally { setSubmitting(false); }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0e1726] px-4 py-12">
      <div className="pointer-events-none absolute -left-32 -top-24 h-[450px] w-[450px] rounded-full bg-blue-600/20 blur-[110px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-[420px] w-[420px] rounded-full bg-indigo-500/15 blur-[110px]" />
      <div className="relative z-10 grid w-full max-w-[920px] overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-2xl shadow-black/30 md:grid-cols-[0.92fr_1.08fr]">
        <div className="hidden flex-col justify-between bg-[#111c2e] p-9 text-white md:flex">
          <div><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500 shadow-lg shadow-blue-950/40"><Box className="h-6 w-6"/></div><h1 className="mt-6 text-[26px] font-semibold tracking-tight">Sandbox Studio</h1><p className="mt-3 text-sm leading-6 text-slate-400">A calm control plane for your isolated development environments.</p></div>
          <div className="space-y-4"><Feature icon={ShieldCheck} title="Safer defaults" text="Non-root containers, bounded resources, network off by default."/><Feature icon={KeyRound} title="Admin-only controls" text="Create, start, stop, inspect, and remove environments."/><div className="pt-5 text-[10px] uppercase tracking-[0.16em] text-slate-600">Local-first · Docker-powered</div></div>
        </div>
        <div className="p-7 sm:p-10 md:p-12">
          <div className="flex items-center gap-3 md:hidden"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white"><Box className="h-5 w-5"/></div><span className="font-semibold text-slate-900">Sandbox Studio</span></div>
          <div className="mt-8 md:mt-2"><p className="text-xs font-semibold uppercase tracking-[0.15em] text-blue-700">Admin access</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Welcome back</h2><p className="mt-2 text-sm leading-6 text-slate-500">Sign in to manage your local sandbox environments.</p></div>
          <form className="mt-8 space-y-5" onSubmit={submit}>
            <div><label htmlFor="username" className="field-label">Username</label><Input id="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></div>
            <div><label htmlFor="password" className="field-label">Password</label><div className="relative"><Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" className="pr-11" value={password} onChange={(event) => setPassword(event.target.value)} required/><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">{showPassword ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}</button></div></div>
            {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs leading-5 text-red-700">{error}</div>}
            <Button type="submit" size="lg" className="w-full" disabled={submitting}>{submitting ? "Signing in…" : <><LockKeyhole className="h-4 w-4"/>Sign in securely</>}</Button>
          </form>
          <div className="mt-7 flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500"/><p className="text-[11px] leading-5 text-slate-500">This app can manage the Docker daemon. Keep it local and change the default credentials before using it on a shared machine.</p></div>
        </div>
      </div>
    </main>
  );
}

function Feature({ icon: Icon, title, text }: { icon: typeof ShieldCheck; title: string; text: string }) {
  return <div className="flex gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-blue-300"><Icon className="h-4 w-4"/></div><div><h3 className="text-xs font-semibold text-slate-100">{title}</h3><p className="mt-1 text-[11px] leading-5 text-slate-500">{text}</p></div></div>;
}
