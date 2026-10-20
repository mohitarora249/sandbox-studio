"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export function Switch({ checked, onChange, disabled, id }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; id?: string }) {
  return (
    <button id={id} type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50", checked ? "bg-blue-600" : "bg-slate-300")}>
      <span className={cn("pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition", checked ? "translate-x-6" : "translate-x-1")} />
    </button>
  );
}
