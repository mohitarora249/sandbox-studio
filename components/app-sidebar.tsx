"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Box, CircleHelp, Command, Cpu, LayoutDashboard, LogOut, Plus, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const nav = [
    { href: "/", label: "Overview", icon: LayoutDashboard },
    { href: "/#sandboxes", label: "Sandboxes", icon: Box },
  ];
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="flex min-h-screen w-[250px] shrink-0 flex-col border-r border-slate-800 bg-[#101827] text-slate-300 max-lg:hidden">
      <div className="flex h-[78px] items-center gap-3 border-b border-white/[0.07] px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500 text-white shadow-lg shadow-blue-950/40"><Box className="h-5 w-5" /></div>
        <div><div className="text-sm font-semibold tracking-tight text-white">Sandbox Studio</div><div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Environment control</div></div>
      </div>
      <div className="px-4 pt-7">
        <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Workspace</p>
        <nav className="space-y-1">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = label === "Overview" ? pathname === "/" : pathname.startsWith("/sandboxes");
            return <Link key={label} href={href} className={cn("group flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition", active ? "bg-white/[0.09] font-medium text-white" : "text-slate-400 hover:bg-white/[0.05] hover:text-white")}><Icon className={cn("h-[17px] w-[17px]", active ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300")} />{label}</Link>;
          })}
        </nav>
        <div className="mt-8 rounded-xl border border-white/[0.08] bg-white/[0.035] p-3.5">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-200"><ShieldCheck className="h-4 w-4 text-emerald-400" />Local admin mode</div>
          <p className="mt-2 text-[11px] leading-5 text-slate-500">Docker access is highly privileged. Keep this dashboard on a trusted machine.</p>
        </div>
      </div>
      <div className="mt-auto border-t border-white/[0.07] p-4">
        <Link href="/sandboxes/new" className="mb-2 flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-medium text-white shadow-sm transition hover:bg-blue-500"><Plus className="h-4 w-4" />New sandbox</Link>
        <Button variant="ghost" className="w-full justify-start text-slate-400 hover:bg-white/[0.06] hover:text-white" onClick={logout}><LogOut className="h-4 w-4" />Sign out</Button>
        <div className="mt-3 flex items-center justify-between px-2 text-[10px] text-slate-600"><span className="flex items-center gap-1"><Command className="h-3 w-3" />Sandbox Studio</span><span>v1.0.0</span></div>
      </div>
    </aside>
  );
}
