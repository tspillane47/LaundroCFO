"use client";

import { useRouter } from "next/navigation";

export function TermsBackLink() {
  const router = useRouter();

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      className="text-[13px] text-slate-500 hover:text-slate-300 mb-6 inline-block"
    >
      ← Back
    </button>
  );
}
