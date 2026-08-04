import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import {
  fetchDigestAlertsForUser,
  getDigestWindowStart,
  groupDigestAlertsByStore,
  sendAlertDigestEmail,
  syncUserAlertsForDigest,
} from "@/lib/email/alertDigest";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { fetchAccessibleStoresForUserId } from "@/lib/store-access";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

type DigestUserResult = {
  userId: string;
  email?: string;
  alertCount: number;
  sent: boolean;
  skipped?: string;
  error?: string;
};

export async function GET(request: Request) {
  const unauthorized = verifyCronRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const startedAt = new Date();
  const admin = createAdminSupabaseClient();
  const results: DigestUserResult[] = [];

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, full_name, email_alerts, last_alert_digest_sent_at")
    .eq("email_alerts", true);

  if (profilesError) {
    console.error("[cron/send-alert-digest] failed to load profiles", profilesError);
    return NextResponse.json({ error: "Failed to load notification profiles" }, { status: 500 });
  }

  for (const profile of profiles ?? []) {
    const userId = profile.id;

    try {
      const {
        data: { user },
        error: userError,
      } = await admin.auth.admin.getUserById(userId);

      if (userError) {
        throw userError;
      }

      const email = user?.email?.trim();
      if (!email) {
        results.push({
          userId,
          alertCount: 0,
          sent: false,
          skipped: "missing_email",
        });
        continue;
      }

      const { data: stores, error: storesError } = await fetchAccessibleStoresForUserId(
        admin,
        userId
      );

      if (storesError) {
        throw storesError;
      }

      if (!stores?.length) {
        results.push({
          userId,
          email,
          alertCount: 0,
          sent: false,
          skipped: "no_stores",
        });
        continue;
      }

      await syncUserAlertsForDigest(admin, {
        userId,
        stores,
      });

      const since = getDigestWindowStart(profile.last_alert_digest_sent_at, startedAt);
      const alerts = await fetchDigestAlertsForUser(admin, {
        since,
        storeIds: stores.map((store) => String(store.id)),
      });

      if (alerts.length === 0) {
        results.push({
          userId,
          email,
          alertCount: 0,
          sent: false,
          skipped: "no_new_alerts",
        });
        continue;
      }

      const storeNamesById = Object.fromEntries(
        stores.map((store) => [String(store.id), String(store.name ?? "Store")])
      );
      const groups = groupDigestAlertsByStore(alerts, storeNamesById);

      await sendAlertDigestEmail({
        to: email,
        recipientName: profile.full_name,
        groups,
      });

      const finishedAt = new Date().toISOString();
      const { error: updateError } = await admin
        .from("profiles")
        .update({ last_alert_digest_sent_at: finishedAt })
        .eq("id", userId);

      if (updateError) {
        throw updateError;
      }

      results.push({
        userId,
        email,
        alertCount: alerts.length,
        sent: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown digest error";
      console.error("[cron/send-alert-digest] user digest failed", { userId, error });
      results.push({
        userId,
        alertCount: 0,
        sent: false,
        error: message,
      });
    }
  }

  const summary = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    usersConsidered: profiles?.length ?? 0,
    emailsSent: results.filter((entry) => entry.sent).length,
    alertsEmailed: results.reduce((sum, entry) => sum + entry.alertCount, 0),
    skipped: results.filter((entry) => entry.skipped).length,
    failures: results.filter((entry) => entry.error),
    results,
  };

  console.log("[cron/send-alert-digest] completed", JSON.stringify(summary, null, 2));

  return NextResponse.json({ ok: true, summary });
}
