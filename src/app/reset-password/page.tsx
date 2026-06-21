"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleReset() {
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    setError("");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setSuccess(true);
    setTimeout(() => router.push("/login"), 2000);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#0d1520] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-[22px] font-bold text-adaptive-info mb-1">LaundroCFO</div>
          <div className="text-adaptive-muted text-[13px]">Set your new password</div>
        </div>
        <div className="card space-y-4">
          {success ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-[12px] text-green-400">
              Password updated! Redirecting to sign in...
            </div>
          ) : (
            <>
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-[12px] text-red-400">
                  {error}
                </div>
              )}
              <div>
                <div className="metric-label mb-1.5">New Password</div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#1e2a3a] border border-white/10 rounded-lg px-3 py-2.5 text-[13px] text-slate-100 outline-none focus:border-blue-500"
                  placeholder="Min 8 characters"
                />
              </div>
              <div>
                <div className="metric-label mb-1.5">Confirm Password</div>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleReset()}
                  className="w-full bg-[#1e2a3a] border border-white/10 rounded-lg px-3 py-2.5 text-[13px] text-slate-100 outline-none focus:border-blue-500"
                  placeholder="Confirm password"
                />
              </div>
              <button
                onClick={handleReset}
                disabled={loading}
                className="btn-primary w-full py-2.5 text-[13px]"
              >
                {loading ? "Updating..." : "Update Password"}
              </button>
            </>
          )}
          <div className="text-center text-[12px] text-adaptive-muted pt-1">
            <Link href="/login" className="text-adaptive-info hover:text-adaptive-info">Back to sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
