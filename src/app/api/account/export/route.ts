import { NextResponse } from "next/server";
import { buildUserDataExport } from "@/lib/account-export";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await buildUserDataExport(supabase, user.id, user.email ?? null);
    const filename = `laundrocfo-export-${payload.exportedAt.slice(0, 10)}.json`;

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[account/export] failed", error);
    return NextResponse.json({ error: "Failed to export data" }, { status: 500 });
  }
}
