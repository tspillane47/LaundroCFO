import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  QB_OAUTH_CSRF_COOKIE,
  buildAuthorizationUrl,
  createOAuthCsrfToken,
  verifyUserOwnsStore,
} from "@/lib/quickbooks";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("storeId");

  if (!storeId) {
    return NextResponse.json({ error: "Missing storeId" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownsStore = await verifyUserOwnsStore(supabase, user.id, storeId);
  if (!ownsStore) {
    return NextResponse.json({ error: "Store not found" }, { status: 403 });
  }

  try {
    const csrfToken = createOAuthCsrfToken();
    const authorizeUrl = buildAuthorizationUrl(storeId, csrfToken);
    const response = NextResponse.redirect(authorizeUrl);

    response.cookies.set(QB_OAUTH_CSRF_COOKIE, csrfToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    });

    return response;
  } catch (error) {
    console.error("[quickbooks/authorize] failed", error);
    return NextResponse.json({ error: "QuickBooks is not configured" }, { status: 500 });
  }
}
