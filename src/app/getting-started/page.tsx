"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { CheckCircle2, Circle } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useStores } from "@/lib/store-context";
import { fetchStoreSetupStatus, type StoreSetupStatus } from "@/lib/gettingStarted";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { PageError } from "@/components/ui/PageError";

export default function GettingStartedPage() {
  const router = useRouter();
  const supabase = createClient();
  const { selectedStore, isAllStores, stores, loading: storesLoading } = useStores();
  const [status, setStatus] = useState<StoreSetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const activeStoreId = isAllStores ? stores[0]?.id : selectedStore?.id;

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      if (!activeStoreId) {
        setStatus(null);
        return;
      }

      const result = await fetchStoreSetupStatus(supabase, activeStoreId);
      setStatus(result);
    } catch {
      setLoadError(true);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [activeStoreId, router, supabase]);

  useEffect(() => {
    if (storesLoading) return;
    void loadStatus();
  }, [loadStatus, storesLoading]);

  if (storesLoading || loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <LoadingSkeleton variant="metric-card" />
        <LoadingSkeleton variant="metric-card" />
        <LoadingSkeleton variant="metric-card" />
      </div>
    );
  }

  if (loadError) {
    return <PageError onRetry={loadStatus} />;
  }

  if (!activeStoreId) {
    return (
      <div className="max-w-2xl mx-auto card text-center py-12 px-6">
        <h1 className="text-[20px] font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
          Getting Started
        </h1>
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          Add a store to begin setup, or select a store from the sidebar.
        </p>
        <Link href="/portfolio" className="btn-primary inline-flex text-[13px] mt-6">
          Go to Portfolio →
        </Link>
      </div>
    );
  }

  const storeName = isAllStores ? stores[0]?.name : selectedStore?.name;
  const allComplete = status?.completedCount === status?.totalCount;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-[22px] font-bold mb-2" style={{ color: "var(--text-primary)" }}>
          {allComplete ? "You're all set!" : "Let's finish setting up"}
        </h1>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {allComplete
            ? "You've added the key details for your store. You can update any section anytime from the sidebar."
            : storeName
              ? `A few quick steps will unlock your full dashboard for ${storeName}. Take them at your own pace — you can come back here anytime.`
              : "A few quick steps will unlock your full dashboard. Take them at your own pace — you can come back here anytime."}
        </p>
      </div>

      {status && (
        <>
          <div
            className="rounded-xl px-4 py-3 mb-6 flex items-center justify-between"
            style={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }}
          >
            <span className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>
              Setup progress
            </span>
            <span className="text-[13px] font-semibold text-blue-500">
              {status.completedCount} of {status.totalCount} complete
            </span>
          </div>

          <div
            className="h-1.5 rounded-full overflow-hidden mb-8"
            style={{ background: "var(--border)" }}
            aria-hidden
          >
            <div
              className="h-full bg-blue-500 transition-all duration-500"
              style={{ width: `${(status.completedCount / status.totalCount) * 100}%` }}
            />
          </div>

          <ul className="space-y-3">
            {status.sections.map((section) => {
              const complete = section.status === "complete";
              return (
                <li
                  key={section.id}
                  className={clsx(
                    "card flex flex-col sm:flex-row sm:items-center gap-4 p-4 sm:p-5",
                    complete && "opacity-90"
                  )}
                  style={{ border: "1px solid var(--border)" }}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {complete ? (
                      <CheckCircle2
                        size={22}
                        className="flex-shrink-0 text-emerald-500 mt-0.5"
                        aria-hidden
                      />
                    ) : (
                      <Circle
                        size={22}
                        className="flex-shrink-0 mt-0.5"
                        style={{ color: "var(--text-muted)" }}
                        aria-hidden
                      />
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h2
                          className="text-[15px] font-semibold"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {section.label}
                        </h2>
                        <span
                          className={clsx(
                            "text-[11px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full",
                            complete
                              ? "bg-emerald-500/15 text-emerald-600"
                              : "bg-[var(--bg-page)] text-[var(--text-muted)]"
                          )}
                        >
                          {complete ? "Complete" : "Not started"}
                        </span>
                      </div>
                      <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                        {section.description}
                      </p>
                    </div>
                  </div>

                  {!complete && (
                    <Link
                      href={section.href}
                      className="btn-primary text-[13px] px-4 py-2.5 whitespace-nowrap sm:flex-shrink-0 text-center"
                    >
                      Set up →
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="mt-8 pt-6 border-t text-center" style={{ borderColor: "var(--border)" }}>
        <Link
          href="/dashboard"
          className="text-[13px] hover:underline underline-offset-2"
          style={{ color: "var(--text-muted)" }}
        >
          Skip for now, I&apos;ll do this later →
        </Link>
      </div>
    </div>
  );
}
