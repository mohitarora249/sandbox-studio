import * as React from "react";
import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  default: "border-blue-200 bg-blue-50 text-blue-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-red-200 bg-red-50 text-red-700",
  muted: "border-slate-200 bg-slate-100 text-slate-600",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
};

export function Badge({ className, tone = "muted", ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof styles }) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none", styles[tone], className)} {...props} />;
}
