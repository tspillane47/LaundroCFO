"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { createClient } from "@/lib/supabase";
import { isAdminEmail } from "@/lib/admin";
import { TRIAL_LENGTH_DAYS } from "@/lib/beta";
import { invalidateBetaModeCache, useBetaMode } from "@/lib/useBetaMode";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { useToast } from "@/components/ui/ToastProvider";

export default function AdminPage() {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const { betaMode, loading: betaLoading, refresh } = useBetaMode();

  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [confirmEndBetaOpen, setConfirmEndBetaOpen] = useState(false);
  const [confirmEnableBetaOpen, setConfirmEnableBetaOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkAdmin() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user || !isAdminEmail(user.email)) {
        router.replace("/dashboard");
        return;
      }

      setAuthorized(true);
      setCheckingAuth(false);
    }

    void checkAdmin();

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  const handleEndBeta = useCallback(async () => {
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/end-beta", { method: "POST" });
      const payload = (await response.json()) as {
        error?: string;
        trialsCreated?: number;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to end beta");
      }

      invalidateBetaModeCache();
      await refresh();
      setConfirmEndBetaOpen(false);
      toast.success(
        `Beta ended. ${payload.trialsCreated ?? 0} trial subscription(s) created.`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to end beta");
    } finally {
      setSubmitting(false);
    }
  }, [refresh, toast]);

  const handleEnableBeta = useCallback(async () => {
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/enable-beta", { method: "POST" });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to enable beta mode");
      }

      invalidateBetaModeCache();
      await refresh();
      setConfirmEnableBetaOpen(false);
      toast.success("Beta mode re-enabled.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to enable beta mode"
      );
    } finally {
      setSubmitting(false);
    }
  }, [refresh, toast]);

  if (checkingAuth || authorized === null) {
    return (
      <div className="space-y-5">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (!authorized) {
    return null;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
          Admin
        </h1>
        <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>
          Platform settings and internal tools.
        </p>
      </div>

      <div className="card space-y-4">
        <div>
          <div className="section-title mb-1">Beta Mode</div>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Controls beta messaging across the app (banner, sidebar badge, pricing copy).
            Ending beta starts {TRIAL_LENGTH_DAYS}-day trials for users without a subscription.
          </p>
        </div>

        <div
          className="flex flex-wrap items-center justify-between gap-4 rounded-lg px-4 py-3 border"
          style={{ borderColor: "var(--border)", background: "var(--bg-card2)" }}
        >
          <div className="flex items-center gap-3">
            <span
              role="switch"
              aria-checked={betaMode}
              aria-label="Beta mode"
              className={clsx(
                "relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors",
                betaMode ? "bg-[#2563eb]" : "bg-slate-300"
              )}
            >
              <span
                className={clsx(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5",
                  betaMode ? "translate-x-5" : "translate-x-0.5"
                )}
              />
            </span>
            <div>
              <div className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                {betaLoading ? "Loading…" : betaMode ? "Beta mode is ON" : "Beta mode is OFF"}
              </div>
              <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Read from <code className="text-[10px]">app_settings.beta_mode</code>
              </div>
            </div>
          </div>

          {betaMode ? (
            <button
              type="button"
              className="btn-primary text-[12px] px-4 py-2"
              onClick={() => setConfirmEndBetaOpen(true)}
              disabled={betaLoading || submitting}
            >
              End Beta — Start Trials
            </button>
          ) : (
            <button
              type="button"
              className="btn-outline text-[12px] px-4 py-2"
              onClick={() => setConfirmEnableBetaOpen(true)}
              disabled={betaLoading || submitting}
            >
              Re-enable Beta Mode
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="section-title mb-2">Tools</div>
        <Link
          href="/admin/feedback"
          className="text-[13px] font-medium hover:underline underline-offset-2"
          style={{ color: "var(--accent)" }}
        >
          Feedback Admin →
        </Link>
      </div>

      {confirmEndBetaOpen && (
        <ConfirmDialog
          title="End beta and start trials?"
          description={`This will turn off beta messaging and create ${TRIAL_LENGTH_DAYS}-day trialing subscriptions (Starter plan) for every user who does not already have one. Existing trial countdowns cannot be silently undone.`}
          confirmLabel="End Beta — Start Trials"
          confirming={submitting}
          onCancel={() => setConfirmEndBetaOpen(false)}
          onConfirm={() => void handleEndBeta()}
          destructive
        />
      )}

      {confirmEnableBetaOpen && (
        <ConfirmDialog
          title="Re-enable beta mode?"
          description="Beta messaging will return across the app. This does not cancel existing subscription records."
          confirmLabel="Re-enable Beta"
          confirming={submitting}
          onCancel={() => setConfirmEnableBetaOpen(false)}
          onConfirm={() => void handleEnableBeta()}
        />
      )}
    </div>
  );
}

type ConfirmDialogProps = {
  title: string;
  description: string;
  confirmLabel: string;
  confirming: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  destructive?: boolean;
};

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  confirming,
  onCancel,
  onConfirm,
  destructive = false,
}: ConfirmDialogProps) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close dialog"
        onClick={onCancel}
      />
      <div
        className="relative w-full max-w-md rounded-xl p-5 shadow-xl border"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-confirm-title"
      >
        <h2
          id="admin-confirm-title"
          className="text-[15px] font-semibold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h2>
        <p className="text-[13px] mb-5" style={{ color: "var(--text-secondary)" }}>
          {description}
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline text-[12px]" onClick={onCancel} disabled={confirming}>
            Cancel
          </button>
          <button
            type="button"
            className={clsx("text-[12px] px-4 py-2 rounded-lg font-semibold text-white", destructive ? "bg-red-600 hover:bg-red-700" : "btn-primary")}
            onClick={onConfirm}
            disabled={confirming}
          >
            {confirming ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
