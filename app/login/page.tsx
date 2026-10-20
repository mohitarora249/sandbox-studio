import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-white">Loading sign-in…</main>}><LoginForm /></Suspense>;
}
