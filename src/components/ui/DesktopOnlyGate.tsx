"use client";

import Link from "next/link";

type DesktopOnlyGateProps = {
  featureName: string;
  children: React.ReactNode;
};

export function DesktopOnlyGate({ featureName, children }: DesktopOnlyGateProps) {
  return (
    <>
      <div className="md:hidden flex items-center justify-center min-h-[60vh] p-4">
        <div className="card max-w-md w-full text-center">
          <p className="text-[15px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            This feature is best experienced on desktop. Please visit LaundroCFO on your computer
            for the full {featureName} experience.
          </p>
          <Link
            href="/dashboard"
            className="btn-primary inline-flex items-center justify-center mt-6 min-h-[44px] px-6 text-[14px]"
          >
            View Dashboard
          </Link>
        </div>
      </div>
      <div className="hidden md:block">{children}</div>
    </>
  );
}
