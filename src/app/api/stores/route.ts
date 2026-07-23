import { NextResponse } from "next/server";
import {
  canAddStore,
  getAccessStatus,
  getUserStoreCount,
  storeLimitUpgradeMessage,
} from "@/lib/access";
import { createServerSupabaseClient } from "@/lib/supabase-server";

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

  const [access, storeCount] = await Promise.all([
    getAccessStatus(supabase, user.id),
    getUserStoreCount(supabase, user.id),
  ]);

  if (!canAddStore(access, storeCount)) {
    return NextResponse.json(
      {
        error: "store_limit_reached",
        message: storeLimitUpgradeMessage(access.plan),
      },
      { status: 403 }
    );
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
