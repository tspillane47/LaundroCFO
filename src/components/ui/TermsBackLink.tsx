"use client";

import { useRouter } from "next/navigation";

const TERMS_RETURN_KEY = "laundrocfo_terms_return_to";

export function setTermsReturnPath(path: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(TERMS_RETURN_KEY, path);
}

export function TermsBackLink() {
  const router = useRouter();

  function handleBack() {
    const returnTo = sessionStorage.getItem(TERMS_RETURN_KEY);
    sessionStorage.removeItem(TERMS_RETURN_KEY);
    if (returnTo && returnTo !== "/terms" && returnTo !== "/login") {
      router.push(returnTo);
      return;
    }
    router.push("/portfolio");
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      className="text-[13px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] mb-6 inline-block"
    >
      ← Back
    </button>
  );
}
