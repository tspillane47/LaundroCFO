"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { isInternalTrafficPath } from "@/lib/analytics";

export const META_PIXEL_ID = "2277198803072381";

type Fbq = (...args: unknown[]) => void;

/**
 * Meta (Facebook) Pixel for Meta ads. The base snippet loads once; because this
 * is a single-page app, PageView is re-sent on each client-side route change.
 * Owner/admin pages are never tracked.
 */
export function MetaPixel() {
  const pathname = usePathname();
  const isFirstRender = useRef(true);
  const skip = isInternalTrafficPath(pathname);

  useEffect(() => {
    // The base snippet already sends the first PageView.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (skip) return;
    const fbq = (window as unknown as { fbq?: Fbq }).fbq;
    if (typeof fbq === "function") fbq("track", "PageView");
  }, [pathname, skip]);

  if (skip) return null;

  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');
`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}
