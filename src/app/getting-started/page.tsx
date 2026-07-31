"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { CheckCircle2, Circle, Store } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useStores } from "@/lib/store-context";
import {
  fetchStoreSetupStatus,
  type SetupSection,
  type StoreSetupStatus,
} from "@/lib/gettingStarted";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { PageError } from "@/components/ui/PageError";
import { INPUT_CLASS } from "@/components/occupancy/shared";
import { TransactionReviewGuide } from "@/components/transactions/TransactionReviewGuide";

function resolveInitialStoreId(
  stores: Array<{ id: string }>,
  selectedStore: { id: string } | null,
  isAllStores: boolean
): string | null {
  if (stores.length === 0) return null;
  if (!isAllStores && selectedStore?.id) return selectedStore.id;
  return stores[0]?.id ?? null;
}

function SetupSectionCard({ section }: { section: SetupSection }) {
  const complete = section.status === "complete";

  if (section.id === "financials" && section.financialOptions) {
    const connectedCount = section.financialOptions.filter((option) => option.connected).length;

    return (
      <li
        className="card p-4 sm:p-5"
        style={{ border: "1px solid var(--border)" }}
      >
        <div className="flex items-start gap-3 mb-4">
          {complete ? (
            <CheckCircle2 size={22} className="flex-shrink-0 text-emerald-500 mt-0.5" aria-hidden />
          ) : (
            <Circle
              size={22}
              className="flex-shrink-0 mt-0.5"
              style={{ color: "var(--text-muted)" }}
              aria-hidden
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
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
            {connectedCount > 0 && (
              <p className="text-[12px] mt-2 text-emerald-600">
                {connectedCount} of {section.financialOptions.length} options connected
              </p>
            )}
          </div>
        </div>

        <ul className="space-y-3">
          {section.financialOptions.map((option) => (
            <li
              key={option.id}
              className={clsx(
                "rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3",
                option.connected ? "bg-emerald-500/5" : "bg-[var(--bg-page)]"
              )}
              style={{ border: "1px solid var(--border)" }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {option.connected ? (
                    <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" aria-hidden />
                  ) : null}
                  <span
                    className={clsx(
                      "text-[13px] font-medium",
                      option.connected ? "text-emerald-700" : "text-[var(--text-primary)]"
                    )}
                  >
                    {option.connected ? option.connectedLabel : option.label}
                  </span>
                </div>
                <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {option.description}
                </p>
              </div>
              {!option.connected && (
                <Link
                  href={option.href}
                  className="btn-outline text-[12px] px-3 py-2 whitespace-nowrap sm:flex-shrink-0 text-center"
                >
                  Set up →
                </Link>
              )}
            </li>
          ))}
        </ul>
      </li>
    );
  }

  return (
    <li
      className={clsx(
        "card flex flex-col sm:flex-row sm:items-center gap-4 p-4 sm:p-5",
        complete && "opacity-90"
      )}
      style={{ border: "1px solid var(--border)" }}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        {complete ? (
          <CheckCircle2 size={22} className="flex-shrink-0 text-emerald-500 mt-0.5" aria-hidden />
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
            <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
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
}

export default function GettingStartedPage() {
  const router = useRouter();
  const supabase = createClient();
  const {
    selectedStore,
    setSelectedStore,
    setIsAllStores,
    isAllStores,
    stores,
    loading: storesLoading,
  } = useStores();
  const [setupStoreId, setSetupStoreId] = useState<string | null>(null);
  const [status, setStatus] = useState<StoreSetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const activeStores = useMemo(
    () => stores.filter((store) => !store.archived),
    [stores]
  );

  const setupStore = useMemo(
    () => activeStores.find((store) => store.id === setupStoreId) ?? null,
    [activeStores, setupStoreId]
  );

  useEffect(() => {
    if (storesLoading) return;
    setSetupStoreId((current) => {
      if (current && activeStores.some((store) => store.id === current)) return current;
      return resolveInitialStoreId(activeStores, selectedStore, isAllStores);
    });
  }, [storesLoading, activeStores, selectedStore, isAllStores]);

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

      if (!setupStoreId) {
        setStatus(null);
        return;
      }

      const result = await fetchStoreSetupStatus(supabase, setupStoreId);
      setStatus(result);
    } catch {
      setLoadError(true);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [setupStoreId, router, supabase]);

  useEffect(() => {
    if (storesLoading || !setupStoreId) return;
    void loadStatus();
  }, [loadStatus, storesLoading, setupStoreId]);

  function handleStoreChange(nextStoreId: string) {
    setSetupStoreId(nextStoreId);
    const nextStore = activeStores.find((store) => store.id === nextStoreId);
    if (nextStore) {
      setSelectedStore(nextStore);
      setIsAllStores(false);
    }
  }

  if (storesLoading || (loading && setupStoreId)) {
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

  if (!setupStoreId || activeStores.length === 0) {
    return (
      <div className="max-w-2xl mx-auto card text-center py-12 px-6">
        <h1 className="text-[20px] font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
          Getting Started
        </h1>
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          Add a store to begin setup.
        </p>
        <Link href="/portfolio" className="btn-primary inline-flex text-[13px] mt-6">
          Go to Portfolio →
        </Link>
      </div>
    );
  }

  const allComplete = status?.completedCount === status?.totalCount;
  const singleStore = activeStores.length === 1;

  return (
    <div className="max-w-2xl mx-auto">
      <div
        className="rounded-xl px-4 py-4 mb-6"
        style={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }}
      >
        {singleStore ? (
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
              style={{ background: "var(--bg-page)", border: "1px solid var(--border)" }}
            >
              <Store size={18} style={{ color: "var(--text-secondary)" }} aria-hidden />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: "var(--text-muted)" }}>
                Setting up
              </div>
              <div className="text-[16px] font-semibold" style={{ color: "var(--text-primary)" }}>
                {setupStore?.name ?? "Your store"}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <label
              htmlFor="getting-started-store"
              className="block text-[13px] font-semibold mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              Choose which store to set up:
            </label>
            <select
              id="getting-started-store"
              value={setupStoreId}
              onChange={(e) => handleStoreChange(e.target.value)}
              className={clsx(INPUT_CLASS, "text-[14px] font-medium py-3")}
            >
              {activeStores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name ?? "Unnamed store"}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="mb-6">
        <h1 className="text-[22px] font-bold mb-2" style={{ color: "var(--text-primary)" }}>
          {allComplete ? "You're all set!" : "Let's finish setting up"}
        </h1>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {allComplete
            ? "You've added the key details for this store. You can update any section anytime from the sidebar."
            : setupStore?.name
              ? `A few quick steps will unlock your full dashboard for ${setupStore.name}. Take them at your own pace — you can come back here anytime.`
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
            {status.sections.map((section) => (
              <SetupSectionCard key={section.id} section={section} />
            ))}
          </ul>

          <TransactionReviewGuide />
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
