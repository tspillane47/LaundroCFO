"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { INPUT_CLASS } from "@/components/occupancy/shared";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const supabase = createClient();

  async function handleSignup() {
    if (!termsAccepted) return;
    setLoading(true);
    setError("");
    const termsAcceptedAt = new Date().toISOString();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { terms_accepted_at: termsAcceptedAt },
      },
    });
    if (error) {
      setError(error.message);
    } else {
      if (data.user?.id) {
        await supabase.from("profiles").upsert({
          id: data.user.id,
          terms_accepted_at: termsAcceptedAt,
        });
      }
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
      <div className="min-h-screen bg-[var(--bg-page)] dark:bg-[#0d1520] flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
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
    <div className="min-h-screen bg-[var(--bg-page)] dark:bg-[#0d1520] flex items-center justify-center">
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
              onKeyDown={e => e.key === "Enter" && handleSignup()}
              className={INPUT_CLASS}
              placeholder="Min 8 characters"
            />
          </div>
          <label className="flex items-start gap-2.5 cursor-pointer group">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500/30"
            />
            <span className="text-[12px] text-slate-400 leading-relaxed group-hover:text-slate-300">
              I have read and agree to the{" "}
              <Link href="/terms" className="text-blue-400 hover:text-blue-300">
                Terms of Service
              </Link>
              {" "}and{" "}
              <Link href="/terms#privacy-policy" className="text-blue-400 hover:text-blue-300">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          <button
            onClick={handleSignup}
            disabled={loading || !termsAccepted}
            className="btn-primary w-full py-2.5 text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
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
