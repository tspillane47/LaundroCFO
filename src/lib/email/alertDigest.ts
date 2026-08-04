import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPortfolioFeedItems } from "@/lib/alertEvaluation";
import { syncPortfolioAlerts, type StoredStoreAlert } from "@/lib/alerts";
import { getAppBaseUrl, getResendClient, getResendFromAddress } from "@/lib/email/resendClient";

export type DigestAlert = Pick<
  StoredStoreAlert,
  "id" | "store_id" | "severity" | "title" | "body" | "created_at"
>;

export type DigestStoreGroup = {
  storeId: string;
  storeName: string;
  alerts: DigestAlert[];
};

const DIGEST_SEVERITIES = ["danger", "warning", "info"] as const;
const DIGEST_FALLBACK_HOURS = 24;

const SEVERITY_LABELS: Record<string, string> = {
  danger: "Critical",
  warning: "Warning",
  info: "Info",
};

const SEVERITY_STYLES: Record<
  string,
  { badgeBg: string; badgeText: string; border: string }
> = {
  danger: { badgeBg: "#fee2e2", badgeText: "#b91c1c", border: "#fecaca" },
  warning: { badgeBg: "#fef3c7", badgeText: "#b45309", border: "#fde68a" },
  info: { badgeBg: "#dbeafe", badgeText: "#1d4ed8", border: "#bfdbfe" },
};

const SEVERITY_ORDER: Record<string, number> = {
  danger: 0,
  warning: 1,
  info: 2,
};

export function getDigestWindowStart(
  lastDigestSentAt: string | null | undefined,
  now: Date = new Date()
): Date {
  if (lastDigestSentAt) {
    const parsed = new Date(lastDigestSentAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date(now.getTime() - DIGEST_FALLBACK_HOURS * 60 * 60 * 1000);
}

export function groupDigestAlertsByStore(
  alerts: DigestAlert[],
  storeNamesById: Record<string, string>
): DigestStoreGroup[] {
  const grouped = new Map<string, DigestAlert[]>();

  for (const alert of alerts) {
    const existing = grouped.get(alert.store_id) ?? [];
    existing.push(alert);
    grouped.set(alert.store_id, existing);
  }

  return Array.from(grouped.entries())
    .map(([storeId, storeAlerts]) => ({
      storeId,
      storeName: storeNamesById[storeId] ?? "Store",
      alerts: [...storeAlerts].sort(
        (a, b) =>
          (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) ||
          a.created_at.localeCompare(b.created_at)
      ),
    }))
    .sort((a, b) => a.storeName.localeCompare(b.storeName));
}

export function buildAlertDigestSubject(alertCount: number): string {
  const noun = alertCount === 1 ? "alert" : "alerts";
  return `LaundroCFO: ${alertCount} new ${noun} for your stores`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildAlertDigestHtml(params: {
  recipientName?: string | null;
  groups: DigestStoreGroup[];
  alertsUrl?: string;
  accountUrl?: string;
}): string {
  const alertsUrl = params.alertsUrl ?? `${getAppBaseUrl()}/alerts`;
  const accountUrl = params.accountUrl ?? `${getAppBaseUrl()}/account`;
  const greetingName = params.recipientName?.trim();
  const intro = greetingName
    ? `Hi ${escapeHtml(greetingName)}, here are new alerts from your stores.`
    : "Here are new alerts from your stores.";

  const storeSections = params.groups
    .map((group) => {
      const alertRows = group.alerts
        .map((alert) => {
          const style = SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.info;
          const label = SEVERITY_LABELS[alert.severity] ?? "Alert";

          return `
            <div style="border: 1px solid ${style.border}; border-radius: 10px; padding: 16px; margin-bottom: 12px; background: #ffffff;">
              <div style="margin-bottom: 8px;">
                <span style="display: inline-block; background: ${style.badgeBg}; color: ${style.badgeText}; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; padding: 4px 8px; border-radius: 999px;">
                  ${escapeHtml(label)}
                </span>
              </div>
              <div style="font-size: 15px; font-weight: 700; color: #1e293b; margin-bottom: 6px;">
                ${escapeHtml(alert.title)}
              </div>
              <div style="font-size: 14px; color: #475569; line-height: 1.6;">
                ${escapeHtml(alert.body)}
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <div style="margin-bottom: 28px;">
          <div style="font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #64748b; margin-bottom: 12px;">
            ${escapeHtml(group.storeName)}
          </div>
          ${alertRows}
        </div>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LaundroCFO Alert Digest</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f7fa; margin: 0; padding: 40px 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="padding: 32px 40px 0;">
      <span style="font-size: 20px; font-weight: 700; color: #0f172a;">Laundro<span style="color: #2563eb;">CFO</span></span>
    </div>
    <div style="padding: 40px;">
      <div style="font-size: 22px; font-weight: 700; color: #1e293b; margin-bottom: 16px;">Daily alert digest</div>
      <div style="font-size: 15px; color: #475569; line-height: 1.7; margin-bottom: 28px;">
        ${intro}
      </div>
      ${storeSections}
      <a href="${escapeHtml(alertsUrl)}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px;">
        View All Alerts →
      </a>
      <div style="margin-top: 24px; font-size: 13px; color: #94a3b8; line-height: 1.6;">
        You are receiving this because email alerts are enabled on your account.
        <a href="${escapeHtml(accountUrl)}" style="color: #2563eb; text-decoration: none;">Manage notification preferences</a>
      </div>
    </div>
    <div style="padding: 24px 40px; background: #f8fafc; font-size: 12px; color: #94a3b8; line-height: 1.6;">
      LaundroCFO · The Financial Operating System for Laundromats
    </div>
  </div>
</body>
</html>`;
}

export async function fetchDigestAlertsForUser(
  supabase: SupabaseClient,
  params: {
    since: Date;
    storeIds: string[];
  }
): Promise<DigestAlert[]> {
  if (params.storeIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("store_alerts")
    .select("id, store_id, severity, title, body, created_at")
    .in("store_id", params.storeIds)
    .gt("created_at", params.since.toISOString())
    .is("resolved_at", null)
    .in("severity", [...DIGEST_SEVERITIES])
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as DigestAlert[];
}

export async function syncUserAlertsForDigest(
  supabase: SupabaseClient,
  params: {
    userId: string;
    stores: Record<string, unknown>[];
  }
): Promise<void> {
  const portfolioFeed = await buildPortfolioFeedItems(supabase, params.stores);
  await syncPortfolioAlerts(supabase, {
    userId: params.userId,
    stores: portfolioFeed,
  });
}

export async function sendAlertDigestEmail(params: {
  to: string;
  recipientName?: string | null;
  groups: DigestStoreGroup[];
}): Promise<{ id: string | null }> {
  const alertCount = params.groups.reduce((sum, group) => sum + group.alerts.length, 0);
  if (alertCount === 0) {
    return { id: null };
  }

  const resend = getResendClient();
  const html = buildAlertDigestHtml({
    recipientName: params.recipientName,
    groups: params.groups,
  });

  const { data, error } = await resend.emails.send({
    from: getResendFromAddress(),
    to: params.to,
    subject: buildAlertDigestSubject(alertCount),
    html,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { id: data?.id ?? null };
}
