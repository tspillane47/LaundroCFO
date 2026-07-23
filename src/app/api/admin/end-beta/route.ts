import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { isAdminEmail } from "@/lib/admin";
import {
  BETA_MODE_SETTING_KEY,
  DEFAULT_TRIAL_PLAN,
  trialEndsAtFromNow,
} from "@/lib/beta";

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return null;
  }

  return user;
}

async function listAllUserIds(admin: ReturnType<typeof createAdminSupabaseClient>) {
  const ids: string[] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    ids.push(...data.users.map((entry) => entry.id));
    if (data.users.length < perPage) break;
    page += 1;
  }

  return ids;
}

export async function POST() {
  try {
    const adminUser = await requireAdmin();
    if (!adminUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminSupabaseClient();
    const trialEndsAt = trialEndsAtFromNow();

    const { data: existingSubscriptions, error: existingError } = await admin
      .from("subscriptions")
      .select("user_id");

    if (existingError) {
      throw existingError;
    }

    const subscribedUserIds = new Set(
      (existingSubscriptions ?? []).map((row) => row.user_id)
    );
    const allUserIds = await listAllUserIds(admin);
    const usersWithoutSubscription = allUserIds.filter(
      (userId) => !subscribedUserIds.has(userId)
    );

    if (usersWithoutSubscription.length > 0) {
      const rows = usersWithoutSubscription.map((userId) => ({
        user_id: userId,
        plan: DEFAULT_TRIAL_PLAN,
        status: "trialing" as const,
        trial_ends_at: trialEndsAt,
      }));

      const { error: insertError } = await admin.from("subscriptions").insert(rows);
      if (insertError) throw insertError;
    }

    const { error: settingsError } = await admin
      .from("app_settings")
      .update({ value: false, updated_at: new Date().toISOString() })
      .eq("key", BETA_MODE_SETTING_KEY);

    if (settingsError) throw settingsError;

    return NextResponse.json({
      ok: true,
      betaMode: false,
      trialsCreated: usersWithoutSubscription.length,
      trialEndsAt,
    });
  } catch (error) {
    console.error("end-beta failed", error);
    return NextResponse.json({ error: "Failed to end beta" }, { status: 500 });
  }
}
