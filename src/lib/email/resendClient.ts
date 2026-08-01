import "server-only";

import { Resend } from "resend";

let resendClient: Resend | null = null;

export function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }

  return resendClient;
}

export function getResendFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL ?? "LaundroCFO <alerts@laundrocfo.com>";
}

export function getAppBaseUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL;

  if (configured) {
    return configured.startsWith("http") ? configured : `https://${configured}`;
  }

  return "https://www.laundrocfo.com";
}
