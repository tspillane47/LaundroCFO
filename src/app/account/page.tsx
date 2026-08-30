"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { invalidateSessionUser } from "@/lib/session-cache";
import { INPUT_CLASS, formatDate } from "@/components/occupancy/shared";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { useToast } from "@/components/ui/ToastProvider";
import {
  formatAccessStatusLabel,
  formatStoreLimit,
  planDisplayName,
  readOnlyActionCopy,
} from "@/lib/access";
import { useAccessStatus } from "@/lib/useAccessStatus";
import { useBetaMode } from "@/lib/useBetaMode";

const ROLE_OPTIONS = ["Owner", "Manager", "Accountant", "Investor"] as const;

type ProfileRow = {
  id: string;
  terms_accepted_at: string | null;
  created_at: string | null;
  full_name: string | null;
  phone: string | null;
  company_name: string | null;
  role: string | null;
  avatar_url: string | null;
  email_alerts: boolean | null;
  weekly_summary: boolean | null;
  monthly_report: boolean | null;
  rent_escalation_alerts: boolean | null;
  updated_at: string | null;
};

type NotificationKey =
  | "email_alerts"
  | "weekly_summary"
  | "monthly_report"
  | "rent_escalation_alerts";

// Email delivery is live for daily alert digests; other notification types remain placeholders.
const NOTIFICATION_TOGGLES: {
  key: NotificationKey;
  label: string;
  description: string;
  enabled?: boolean;
}[] = [
  {
    key: "email_alerts",
    label: "Email Alerts",
    description: "Daily email digest when new alerts are triggered for your stores",
    enabled: true,
  },
  {
    key: "weekly_summary",
    label: "Weekly Summary",
    description: "Weekly performance summary by email every Monday (coming soon)",
  },
  {
    key: "monthly_report",
    label: "Monthly Report",
    description: "Monthly operating report by email (coming soon)",
  },
  {
    key: "rent_escalation_alerts",
    label: "Rent Escalation Warnings",
    description: "Email 6 months before rent escalations (coming soon)",
  },
];

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function boolOrDefault(value: boolean | null, fallback: boolean): boolean {
  return value ?? fallback;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function AccountPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const toast = useToast();
  const { betaMode, loading: betaLoading } = useBetaMode();
  const {
    isReadOnly,
    plan,
    maxStores,
    reason,
    trialEndsAt,
    currentPeriodEnd,
    loading: accessLoading,
  } = useAccessStatus();

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [error, setError] = useState("");

  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");
  const [lastSignInAt, setLastSignInAt] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [role, setRole] = useState<string>(ROLE_OPTIONS[0]);

  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [termsAcceptedAt, setTermsAcceptedAt] = useState<string | null>(null);

  const [notifications, setNotifications] = useState({
    email_alerts: true,
    weekly_summary: true,
    monthly_report: true,
    rent_escalation_alerts: true,
  });

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState("");

  const loadAccount = useCallback(async () => {
    setLoading(true);
    setError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    setUserId(user.id);
    setUserEmail(user.email ?? "");
    setEmailInput(user.email ?? "");
    setLastSignInAt(user.last_sign_in_at ?? null);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id, terms_accepted_at, created_at, full_name, phone, company_name, role, avatar_url, email_alerts, weekly_summary, monthly_report, rent_escalation_alerts, updated_at"
      )
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    const row = profile as ProfileRow | null;

    setFullName(row?.full_name ?? user.user_metadata?.full_name ?? "");
    setPhone(row?.phone ?? "");
    setCompanyName(row?.company_name ?? "");
    setRole(row?.role && ROLE_OPTIONS.includes(row.role as (typeof ROLE_OPTIONS)[number]) ? row.role : ROLE_OPTIONS[0]);
    setCreatedAt(row?.created_at ?? null);
    setTermsAcceptedAt(row?.terms_accepted_at ?? (user.user_metadata?.terms_accepted_at as string | undefined) ?? null);
    setNotifications({
      email_alerts: boolOrDefault(row?.email_alerts ?? null, true),
      weekly_summary: boolOrDefault(row?.weekly_summary ?? null, true),
      monthly_report: boolOrDefault(row?.monthly_report ?? null, true),
      rent_escalation_alerts: boolOrDefault(row?.rent_escalation_alerts ?? null, true),
    });

    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    setStripeCustomerId(subscription?.stripe_customer_id ?? null);

    setLoading(false);
  }, [router, supabase]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  useEffect(() => {
    if (searchParams.get("email_updated") === "1") {
      setEmailSuccess("Your email address has been updated.");
      setEmailError("");
      router.replace("/account", { scroll: false });
    } else if (searchParams.get("error") === "email_change_failed") {
      setEmailError(
        "We couldn't confirm your email change. This can happen if the link expired or was opened by your email provider — request a new confirmation email and try again."
      );
      setEmailSuccess("");
      router.replace("/account", { scroll: false });
    }
  }, [router, searchParams]);

  async function handleSaveProfile() {
    if (!userId) return;
    setSavingProfile(true);
    setError("");

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
        company_name: companyName.trim() || null,
        role,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updateError) {
      setError(updateError.message);
      toast.error("Failed to save profile — please try again");
    } else {
      toast.success("Profile saved");
    }

    setSavingProfile(false);
  }

  async function handleSaveEmail() {
    const trimmed = emailInput.trim();
    setEmailError("");
    setEmailSuccess("");

    if (!trimmed) {
      setEmailError("Email address is required");
      return;
    }

    if (!isValidEmail(trimmed)) {
      setEmailError("Please enter a valid email address");
      return;
    }

    if (trimmed.toLowerCase() === userEmail.toLowerCase()) {
      setEmailError("This is already your current email address");
      return;
    }

    setSavingEmail(true);
    const emailConfirmNext = encodeURIComponent("/account?email_updated=1");
    const { error: updateError } = await supabase.auth.updateUser(
      { email: trimmed },
      {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=${emailConfirmNext}`,
      }
    );
    setSavingEmail(false);

    if (updateError) {
      setEmailError(updateError.message);
    } else {
      setEmailSuccess(
        `Confirmation email sent to ${trimmed}. Click the link in that email to complete the change. Your current email remains active until confirmed.`
      );
      setEmailInput(userEmail);
    }
  }

  async function handleChangePassword() {
    if (!userEmail) {
      toast.error("No email address on file");
      return;
    }

    setSendingReset(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(userEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSendingReset(false);

    if (resetError) {
      toast.error(resetError.message);
    } else {
      toast.success("Password reset email sent");
    }
  }

  async function handleNotificationChange(key: NotificationKey, checked: boolean) {
    if (!userId) return;

    const previous = notifications[key];
    setNotifications((n) => ({ ...n, [key]: checked }));

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        [key]: checked,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updateError) {
      setNotifications((n) => ({ ...n, [key]: previous }));
      toast.error("Failed to update notification preferences");
    } else {
      toast.success("Notification preferences updated");
    }
  }

  async function handleExportData() {
    setExportLoading(true);

    try {
      const response = await fetch("/api/account/export");

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to export data");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const disposition = response.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      anchor.href = url;
      anchor.download =
        filenameMatch?.[1] ?? `laundrocfo-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Your data download has started");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export data");
    } finally {
      setExportLoading(false);
    }
  }

  async function handleManageBilling() {
    setPortalError("");
    setPortalLoading(true);

    try {
      const response = await fetch("/api/stripe/create-portal-session", {
        method: "POST",
      });

      const data = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !data.url) {
        throw new Error(data.error ?? "Could not open billing portal");
      }

      window.location.href = data.url;
    } catch (error) {
      setPortalError(
        error instanceof Error ? error.message : "Could not open billing portal"
      );
      setPortalLoading(false);
    }
  }

  async function handleDeleteAccountConfirm() {
    if (deleteConfirmText !== "DELETE" || deletingAccount) return;

    setDeletingAccount(true);
    try {
      const response = await fetch("/api/account/delete", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to delete account");
      }

      toast.success("Your account has been permanently deleted");
      await supabase.auth.signOut();
      invalidateSessionUser();
      router.push("/login");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete account");
      setDeletingAccount(false);
    }
  }

  if (loading) {
    return <LoadingSkeleton variant="page" />;
  }

  const readOnlyCopy = !betaMode && isReadOnly ? readOnlyActionCopy(reason) : null;

  return (
    <div className="space-y-5 max-w-3xl mx-auto w-full">
      <div>
        <h1 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
          Account
        </h1>
        <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>
          Manage your profile, security, billing, and notification preferences.
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-[12px] text-red-400">
          {error}
        </div>
      )}

      {/* Section 1 — Profile */}
      <div className="card space-y-4">
        <div className="section-title mb-0">Profile</div>

        <div>
          <div className="metric-label mb-1.5">Full Name</div>
          <input
            id="account-fullname"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={INPUT_CLASS}
            placeholder="Your full name"
          />
        </div>

        <div>
          <div className="metric-label mb-1.5">Email</div>
          <input
            id="account-emailinput"
            type="email"
            value={emailInput}
            onChange={(e) => {
              setEmailInput(e.target.value);
              setEmailError("");
              setEmailSuccess("");
            }}
            className={INPUT_CLASS}
            placeholder="you@example.com"
          />
          {emailError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-[12px] text-red-400 mt-2">
              {emailError}
            </div>
          )}
          {emailSuccess && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-[12px] text-green-400 mt-2">
              {emailSuccess}
            </div>
          )}
          <button
            type="button"
            onClick={() => void handleSaveEmail()}
            disabled={savingEmail}
            className="btn-primary w-full sm:w-auto mt-3"
          >
            {savingEmail ? "Saving..." : "Update Email"}
          </button>
        </div>

        <div>
          <div className="metric-label mb-1.5">Phone Number</div>
          <input
            id="account-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={INPUT_CLASS}
            placeholder="(555) 555-5555"
          />
        </div>

        <div>
          <div className="metric-label mb-1.5">Company / Business Name</div>
          <input
            id="account-companyname"
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className={INPUT_CLASS}
            placeholder="Your business name"
          />
        </div>

        <div>
          <div className="metric-label mb-1.5">Role</div>
          <select id="account-role" value={role} onChange={(e) => setRole(e.target.value)} className={INPUT_CLASS}>
            {ROLE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => void handleSaveProfile()}
          disabled={savingProfile}
          className="btn-primary w-full sm:w-auto"
        >
          {savingProfile ? "Saving..." : "Save Profile"}
        </button>
      </div>

      {/* Section 2 — Security */}
      <div className="card space-y-4">
        <div className="section-title mb-0">Security</div>

        <button
          type="button"
          onClick={() => void handleChangePassword()}
          disabled={sendingReset}
          className="btn-outline"
        >
          {sendingReset ? "Sending..." : "Change Password"}
        </button>

        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {[
            ["Last sign in", formatDateTime(lastSignInAt)],
            ["Member since", formatDate(createdAt)],
            ["Terms accepted", formatDate(termsAcceptedAt)],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex justify-between py-2.5 text-[13px]">
              <span style={{ color: "var(--text-secondary)" }}>{label}</span>
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Section 3 — Billing */}
      <div className="card space-y-4">
        <div className="section-title mb-0">Billing</div>

        {betaLoading || accessLoading ? (
          <LoadingSkeleton rows={3} />
        ) : betaMode ? (
          <>
            <div
              className="rounded-lg p-4"
              style={{
                background: "var(--bg-card2)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  Beta — All Features Free
                </div>
                <span className="badge badge-blue">Current Plan</span>
              </div>
              <ul className="space-y-1.5 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                <li>Unlimited stores</li>
                <li>All features</li>
                <li>Priority feedback</li>
              </ul>
            </div>

            <Link href="/pricing" className="btn-outline inline-flex">
              View Pricing
            </Link>

            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              <div className="flex justify-between py-2.5 text-[13px] gap-4">
                <span style={{ color: "var(--text-secondary)" }}>Payment method</span>
                <span className="text-right" style={{ color: "var(--text-muted)" }}>
                  Not configured — will be set up when billing launches
                </span>
              </div>
              <div className="flex justify-between py-2.5 text-[13px]">
                <span style={{ color: "var(--text-secondary)" }}>Billing history</span>
                <span style={{ color: "var(--text-muted)" }}>No billing history yet</span>
              </div>
            </div>
          </>
        ) : (
          <>
            {readOnlyCopy && (
              <div
                className="rounded-lg px-4 py-3 flex items-center justify-between gap-4"
                style={{
                  background: "var(--bg-warning-tint, var(--bg-info-tint))",
                  border: "1px solid var(--border)",
                  color: "var(--text-warning, var(--text-info))",
                }}
              >
                <p className="text-[12px] leading-snug">{readOnlyCopy.message}</p>
                <Link
                  href="/pricing"
                  className="flex-shrink-0 text-[12px] font-semibold underline underline-offset-2 hover:opacity-80"
                >
                  {readOnlyCopy.action}
                </Link>
              </div>
            )}

            <div
              className="rounded-lg p-4"
              style={{
                background: "var(--bg-card2)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {planDisplayName(plan)}
                </div>
                <span
                  className={`badge ${isReadOnly ? "badge-amber" : "badge-green"}`}
                >
                  {formatAccessStatusLabel(reason, trialEndsAt)}
                </span>
              </div>
              <ul className="space-y-1.5 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                <li>{formatStoreLimit(maxStores)}</li>
                {currentPeriodEnd && (
                  <li>Billing period ends {formatDate(currentPeriodEnd.toISOString())}</li>
                )}
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/pricing" className="btn-outline inline-flex">
                {readOnlyCopy ? readOnlyCopy.action : "Manage Plan"}
              </Link>
              {stripeCustomerId ? (
                <button
                  type="button"
                  onClick={() => void handleManageBilling()}
                  disabled={portalLoading}
                  className="btn-primary inline-flex disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {portalLoading ? "Redirecting…" : "Manage Billing"}
                </button>
              ) : (
                <p className="text-[12px] self-center" style={{ color: "var(--text-muted)" }}>
                  <Link
                    href="/pricing"
                    className="underline underline-offset-2 hover:opacity-80"
                  >
                    Subscribe first
                  </Link>{" "}
                  to manage billing
                </p>
              )}
            </div>

            {portalError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-[12px] text-red-400">
                {portalError}
              </div>
            )}

            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              <div className="flex justify-between py-2.5 text-[13px] gap-4">
                <span style={{ color: "var(--text-secondary)" }}>Status</span>
                <span
                  className="text-right font-medium"
                  style={{ color: isReadOnly ? "var(--text-warning)" : "var(--text-primary)" }}
                >
                  {formatAccessStatusLabel(reason, trialEndsAt)}
                </span>
              </div>
              {currentPeriodEnd && (
                <div className="flex justify-between py-2.5 text-[13px] gap-4">
                  <span style={{ color: "var(--text-secondary)" }}>Billing period ends</span>
                  <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {formatDate(currentPeriodEnd.toISOString())}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-2.5 text-[13px]">
                <span style={{ color: "var(--text-secondary)" }}>Billing history</span>
                <span style={{ color: "var(--text-muted)" }}>
                  {isReadOnly ? "Subscribe to start billing" : "No billing history yet"}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Section 4 — Notifications */}
      <div className="card space-y-1">
        <div className="section-title mb-2">Notifications</div>
        <p className="text-[12px] mb-3" style={{ color: "var(--text-muted)" }}>
          Store alerts appear in the app today (dashboard toasts and the Alerts page). Daily email
          digests are sent when Email Alerts is enabled and new alerts are detected.
        </p>

        {NOTIFICATION_TOGGLES.map(({ key, label, description, enabled = false }) => (
          <div
            key={key}
            className={`flex items-start justify-between gap-4 py-3 border-b last:border-b-0 ${
              enabled ? "" : "opacity-70"
            }`}
            style={{ borderColor: "var(--border)" }}
          >
            <div className="min-w-0">
              <div
                className="text-[13px] font-medium flex items-center gap-2 flex-wrap"
                style={{ color: "var(--text-primary)" }}
              >
                {label}
                {!enabled && (
                  <span className="badge badge-amber text-[10px]">Coming soon</span>
                )}
              </div>
              <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                {description}
              </p>
            </div>
            <ToggleSwitch
              id={`notification-${key}`}
              checked={notifications[key]}
              disabled={!enabled}
              aria-label={enabled ? label : `${label} (coming soon)`}
              onChange={(checked) => void handleNotificationChange(key, checked)}
            />
          </div>
        ))}
      </div>

      {/* Section 5 — Your Data */}
      <div className="card space-y-4">
        <div className="section-title mb-0">Your Data</div>

        <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          Download a copy of your profile, stores, financial data, and other account information
          as a JSON file.
        </p>

        <button
          type="button"
          onClick={handleExportData}
          disabled={exportLoading}
          className="btn-outline w-full sm:w-auto"
        >
          {exportLoading ? "Preparing export…" : "Export My Data"}
        </button>
      </div>

      {/* Section 6 — Danger Zone */}
      <div
        className="card space-y-4"
        style={{
          borderColor: "rgba(185, 28, 28, 0.35)",
          background: "var(--bg-danger-tint)",
        }}
      >
        <div className="section-title mb-0" style={{ color: "var(--text-danger)" }}>
          Danger Zone
        </div>

        <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          Permanently delete your account and all associated data, including connected QuickBooks
          and bank accounts. This action cannot be undone.
        </p>

        <button
          type="button"
          onClick={() => {
            setDeleteConfirmText("");
            setDeleteModalOpen(true);
          }}
          className="btn-outline w-full sm:w-auto text-red-400 border-red-500/30"
        >
          Delete Account
        </button>
      </div>

      {deleteModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !deletingAccount && setDeleteModalOpen(false)}
        >
          <div
            className="card max-w-md w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
          >
            <div>
              <h2
                id="delete-account-title"
                className="text-[15px] font-semibold"
                style={{ color: "var(--text-danger)" }}
              >
                Delete Account
              </h2>
              <p className="text-[12px] mt-2" style={{ color: "var(--text-secondary)" }}>
                This will permanently delete your account and all associated data, including
                connected QuickBooks and bank accounts. Type <strong>DELETE</strong> to confirm.
              </p>
            </div>

            <div>
              <label
                htmlFor="delete-confirm"
                className="metric-label mb-1.5 block"
              >
                Confirmation
              </label>
              <input
                id="delete-confirm"
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className={INPUT_CLASS}
                placeholder="Type DELETE"
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className="btn-outline flex-1"
                onClick={() => setDeleteModalOpen(false)}
                disabled={deletingAccount}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 rounded-lg px-4 py-2.5 text-[13px] font-medium text-white disabled:opacity-40"
                style={{ background: "var(--text-danger)" }}
                disabled={deleteConfirmText !== "DELETE" || deletingAccount}
                onClick={() => void handleDeleteAccountConfirm()}
              >
                {deletingAccount ? "Processing..." : "Delete Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
