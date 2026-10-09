"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { applyInternalTrafficOptOut } from "@/lib/analytics";

/**
 * Keeps owner/admin visits out of GA4. Reads the real URL (not useSearchParams)
 * so it cannot suspend. Re-evaluates on every route change because the flag is
 * path-dependent (/admin) as well as browser-dependent (?ga_optout=1).
 */
export function InternalTrafficGuard() {
  const pathname = usePathname();

  useEffect(() => {
    applyInternalTrafficOptOut(pathname, window.location.search);
  }, [pathname]);

  return null;
}
