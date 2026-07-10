import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  QB_OAUTH_CSRF_COOKIE,
  decodeOAuthState,
  exchangeAuthorizationCode,
  financialsRedirectUrl,
  upsertQuickBooksConnection,
  verifyUserOwnsStore,
} from "@/lib/quickbooks";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const realmId = searchParams.get("realmId");
  const stateParam = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      financialsRedirectUrl(origin, "error", oauthError)
    );
  }

  if (!code || !realmId || !stateParam) {
    return NextResponse.redirect(
      financialsRedirectUrl(origin, "error", "missing_params")
    );
  }

  const state = decodeOAuthState(stateParam);
  if (!state) {
    return NextResponse.redirect(
      financialsRedirectUrl(origin, "error", "invalid_state")
    );
  }

  const cookieStore = cookies();
  const expectedCsrf = cookieStore.get(QB_OAUTH_CSRF_COOKIE)?.value;
  if (!expectedCsrf || expectedCsrf !== state.csrf) {
    return NextResponse.redirect(
      financialsRedirectUrl(origin, "error", "csrf_mismatch")
    );
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(
      financialsRedirectUrl(origin, "error", "unauthorized")
    );
  }

  const ownsStore = await verifyUserOwnsStore(supabase, user.id, state.storeId);
  if (!ownsStore) {
    return NextResponse.redirect(
      financialsRedirectUrl(origin, "error", "forbidden")
    );
  }

  try {
    const tokens = await exchangeAuthorizationCode(code);
    await upsertQuickBooksConnection({
      storeId: state.storeId,
      userId: user.id,
      realmId,
      tokens,
    });

    const response = NextResponse.redirect(financialsRedirectUrl(origin, "connected"));
    response.cookies.set(QB_OAUTH_CSRF_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    console.error("[quickbooks/callback] failed", error);
    return NextResponse.redirect(
      financialsRedirectUrl(origin, "error", "token_exchange_failed")
    );
  }
}
