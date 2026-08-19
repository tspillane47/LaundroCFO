import { NextResponse } from "next/server";
import {
  canAddStore,
  getAccessStatus,
  getUserStoreCount,
  storeCreationBlockedMessage,
} from "@/lib/access";
import {
  fetchOnboardingProfile,
  isJoiningOnboardingPath,
  JOIN_PATH_STORE_CREATION_MESSAGE,
} from "@/lib/onboarding";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ensureAutoTrialSubscription } from "@/lib/trial-grant";

/** Always evaluate access from the DB on each request — never rely on client cache or RLS alone. */
export const dynamic = "force-dynamic";

type CreateStoreBody = {
  name?: unknown;
  address?: unknown;
  square_footage?: unknown;
  store_type?: unknown;
  year_opened?: unknown;
};

function toNullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await fetchOnboardingProfile(supabase, user.id);
  if (isJoiningOnboardingPath(profile?.onboarding_path)) {
    return NextResponse.json(
      {
        error: "join_path",
        message: JOIN_PATH_STORE_CREATION_MESSAGE,
      },
      { status: 403 }
    );
  }

  const admin = createAdminSupabaseClient();
  await ensureAutoTrialSubscription(admin, user.id, profile);

  const [access, storeCount] = await Promise.all([
    getAccessStatus(supabase, user.id),
    getUserStoreCount(supabase, user.id),
  ]);

  if (!canAddStore(access, storeCount)) {
    return NextResponse.json(
      {
        error: access.isReadOnly ? "subscription_required" : "store_limit_reached",
        message: storeCreationBlockedMessage(access),
      },
      { status: 403 }
    );
  }

  let body: CreateStoreBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const address = typeof body.address === "string" ? body.address.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Store name is required" }, { status: 400 });
  }

  const { data: existingStores } = await supabase
    .from("stores")
    .select("id, created_at")
    .eq("user_id", user.id)
    .eq("name", name)
    .eq("address", address);

  if (existingStores?.length) {
    const recent = existingStores.find(
      (store) => Date.now() - new Date(store.created_at).getTime() < 60_000
    );
    if (recent) {
      return NextResponse.json({ id: recent.id });
    }
  }

  const { data: newStore, error } = await supabase
    .from("stores")
    .insert({
      user_id: user.id,
      name,
      address,
      square_footage: toNullableNumber(body.square_footage),
      store_type: typeof body.store_type === "string" ? body.store_type : null,
      year_opened: toNullableNumber(body.year_opened),
    })
    .select("id")
    .single();

  if (error || !newStore) {
    console.error("Store creation error:", error);
    return NextResponse.json(
      { error: "We couldn't create your store. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: newStore.id });
}
