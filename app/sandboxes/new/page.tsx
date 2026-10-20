import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SandboxCreateForm } from "@/components/sandbox-create-form";

export default function NewSandboxPage() {
  return (
    <main className="min-h-screen bg-slate-50/80">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Back to sandboxes
        </Link>
        <div className="mt-8 max-w-2xl">
          <p className="eyebrow">Provision an environment</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Create a sandbox</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Choose a runtime and resource budget. Sandbox Studio provisions a dedicated container and a persistent workspace volume.</p>
        </div>
        <div className="mt-8 max-w-3xl"><SandboxCreateForm /></div>
      </div>
    </main>
  );
}
