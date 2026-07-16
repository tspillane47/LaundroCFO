import { NextResponse } from "next/server";
import {
  handlePlaidWebhookPayload,
  type PlaidWebhookPayload,
  verifyPlaidWebhookSignature,
} from "@/lib/plaid";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const verificationHeader =
    request.headers.get("Plaid-Verification") ??
    request.headers.get("plaid-verification");

  const body = await request.text();

  const isValid = await verifyPlaidWebhookSignature(body, verificationHeader);
  if (!isValid) {
    console.warn("[plaid/webhook] signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    await handlePlaidWebhookPayload(payload as PlaidWebhookPayload);
  } catch (error) {
    console.error("[plaid/webhook] handler failed", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
