"use client";
import { useState, Suspense } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { INPUT_CLASS } from "@/components/occupancy/shared";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const urlError = searchParams.get("error");
  const urlMessage = searchParams.get("message");

  async function handleLogin() {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else router.push("/dashboard");
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[var(--bg-page)] dark:bg-[#0d1520] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-[22px] font-bold text-blue-300 mb-1">LaundroCFO</div>
          <div className="text-slate-500 text-[13px]">Sign in to your account</div>
        </div>
        <div className="card space-y-4">
          {urlError === "verification_failed" && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-[12px] text-red-400">
              Email verification failed. Please try signing in or request a new verification email.
            </div>
          )}
          {urlMessage === "check_email" && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-[12px] text-blue-400">
              Please check your email and click the confirmation link before signing in.
            </div>
          )}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-[12px] text-red-400">
              {error}
            </div>
          )}
          <div>
            <div className="metric-label mb-1.5">Email</div>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={INPUT_CLASS}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <div className="metric-label mb-1.5">Password</div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              className={INPUT_CLASS}
              placeholder="••••••••"
            />
          </div>
          <button
            onClick={handleLogin}
            disabled={loading}
            className="btn-primary w-full py-2.5 text-[13px]"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
          <div className="flex justify-between text-[12px] text-slate-500 pt-1">
            <Link href="/forgot-password" className="hover:text-slate-300">Forgot password?</Link>
          </div>
          <div className="text-center pt-2 border-t border-[var(--border)]">
            <Link href="/signup" className="text-[13px] text-blue-400 hover:text-blue-300 font-medium">
              Don&apos;t have an account? Sign up free →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--bg-page)] dark:bg-[#0d1520] flex items-center justify-center">
        <div className="text-slate-500 text-[13px]">Loading...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
