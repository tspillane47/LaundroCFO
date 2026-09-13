"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { trackSignUpEvent } from "@/lib/analytics";
import { SIGNUP_COMPLETE_PARAM } from "@/lib/auth-callback";

/**
 * Fires `sign_up` after the server confirm route redirects with `signup_complete=1`.
 * That param is set from the user-object signup signal, not from URL `type=signup`.
 * Reads the real URL so this cannot suspend on useSearchParams.
 */
export function SignupConversionTracker() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const signupComplete = params.get(SIGNUP_COMPLETE_PARAM) === "1";
    if (!signupComplete) return;

    trackSignUpEvent();

    params.delete(SIGNUP_COMPLETE_PARAM);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [pathname, router]);

  return null;
}
