"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase";
import Link from "next/link";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const supabase = createClient();

  async function handleSignup() {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
    } else {
      setPendingEmail(email);
      setPending(true);
    }
    setLoading(false);
  }

  async function handleResend() {
    setResendLoading(true);
    setResendMessage("");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: pendingEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) setResendMessage(error.message);
    else setResendMessage("Verification email sent! Check your inbox.");
    setResendLoading(false);
  }

  if (pending) {
    return (
      <div className="min-h-screen bg-[#0d1520] flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="text-[64px] mb-6">✉️</div>
          <h1 className="text-[28px] font-bold text-slate-100 mb-3">Check your email</h1>
          <p className="text-[15px] text-slate-400 leading-relaxed mb-2">
            We sent a confirmation link to{" "}
            <span className="text-blue-300 font-medium">{pendingEmail}</span>.
          </p>
          <p className="text-[15px] text-slate-400 leading-relaxed mb-8">
            Click the link to activate your account.
          </p>

          {resendMessage && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-[12px] text-blue-400 mb-4">
              {resendMessage}
            </div>
          )}

          <button
            onClick={handleResend}
            disabled={resendLoading}
            className="btn-primary w-full py-3 text-[14px] mb-4"
          >
            {resendLoading ? "Sending..." : "Resend Email"}
          </button>

          <Link
            href="/signup"
            onClick={() => { setPending(false); setEmail(""); setPassword(""); }}
            className="text-[13px] text-slate-500 hover:text-slate-300"
          >
            Wrong email? Go back
          </Link>

          <p className="text-[12px] text-slate-600 mt-6">
            Check your spam folder if you don&apos;t see it within a minute.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1520] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-[22px] font-bold text-blue-300 mb-1">LaundroCFO</div>
          <div className="text-slate-500 text-[13px]">Create your free account</div>
        </div>
        <div className="card space-y-4">
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
              className="w-full bg-[#1e2a3a] border border-white/10 rounded-lg px-3 py-2.5 text-[13px] text-slate-100 outline-none focus:border-blue-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <div className="metric-label mb-1.5">Password</div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSignup()}
              className="w-full bg-[#1e2a3a] border border-white/10 rounded-lg px-3 py-2.5 text-[13px] text-slate-100 outline-none focus:border-blue-500"
              placeholder="Min 8 characters"
            />
          </div>
          <button
            onClick={handleSignup}
            disabled={loading}
            className="btn-primary w-full py-2.5 text-[13px]"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
          <div className="text-center text-[12px] text-slate-500 pt-1">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-400 hover:text-blue-300">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
