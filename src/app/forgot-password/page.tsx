"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { INPUT_CLASS } from "@/components/occupancy/shared";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleReset() {
    setLoading(true);
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-[22px] font-bold text-blue-300 mb-1">LaundroCFO</div>
          <div className="text-[var(--text-muted)] text-[13px]">Reset your password</div>
        </div>
        <div className="card space-y-4">
          {sent ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-[12px] text-green-400">
              Check your email for a reset link.
            </div>
          ) : (
            <>
              <div>
                <div className="metric-label mb-1.5">Email</div>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleReset()}
                  className={INPUT_CLASS}
                  placeholder="you@example.com"
                />
              </div>
              <button
                onClick={handleReset}
                disabled={loading}
                className="btn-primary w-full py-2.5 text-[13px]"
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
            </>
          )}
          <div className="text-center text-[12px] text-[var(--text-muted)] pt-1">
            <Link href="/login" className="text-blue-400 hover:text-blue-300">Back to sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
