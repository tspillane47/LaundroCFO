"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { createClient } from "@/lib/supabase";
import { useStores } from "@/lib/store-context";
import { generatePortfolioAlerts, type AlertItem } from "@/lib/alerts";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageError } from "@/components/ui/PageError";

const severityStyles: Record<string, { bg: string; border: string }> = {
  danger: { bg: "bg-red-500/15", border: "border-red-500/20" },
  warning: { bg: "bg-amber-500/15", border: "border-amber-500/20" },
  info: { bg: "bg-blue-500/15", border: "border-blue-500/20" },
  success: { bg: "bg-green-500/15", border: "" },
};

const tagStyles: Record<string, string> = {
  danger: "badge-red",
  warning: "badge-amber",
  info: "badge-blue",
  success: "badge-green",
};

function AlertSeverityIcon({ severity }: { severity: AlertItem["severity"] }) {
  if (severity === "warning") {
    return (
      <svg viewBox="0 0 16 16" className="w-4 h-4" aria-hidden="true">
        <path
          d="M8 1.5L15 14H1L8 1.5Z"
          className="fill-amber-500 stroke-amber-400"
          strokeWidth="0.75"
        />
      </svg>
    );
  }

  const color =
    severity === "danger"
      ? "fill-red-500"
      : severity === "success"
        ? "fill-green-500"
        : "fill-blue-500";

  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4" aria-hidden="true">
      <circle cx="8" cy="8" r="5" className={color} />
    </svg>
  );
}

export default function AlertsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { stores, loading: storesLoading, setSelectedStore, setIsAllStores } = useStores();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  const loadData = useCallback(async () => {
    if (stores.length === 0) {
      setAlerts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(false);

    try {
      const storeIds = stores.map((s) => s.id);
      const [{ data: leasesData, error: leaseError }, { data: equipmentData, error: equipError }, { data: insuranceData, error: insError }] =
        await Promise.all([
          supabase.from("leases").select("*").in("store_id", storeIds),
          supabase.from("equipment_inventory").select("*").in("store_id", storeIds),
          supabase
            .from("insurance_policies")
            .select("*")
            .in("store_id", storeIds)
            .eq("is_active", true),
        ]);

      if (leaseError) throw leaseError;
      if (equipError) throw equipError;
      if (insError) throw insError;

      const leasesByStore: Record<string, Record<string, unknown>> = {};
      for (const l of leasesData ?? []) {
        if (!leasesByStore[l.store_id]) leasesByStore[l.store_id] = l;
      }

      const equipmentByStore: Record<string, Record<string, unknown>[]> = {};
      for (const e of equipmentData ?? []) {
        if (!equipmentByStore[e.store_id]) equipmentByStore[e.store_id] = [];
        equipmentByStore[e.store_id].push(e);
      }

      const insuranceByStore: Record<string, Record<string, unknown>[]> = {};
      for (const p of insuranceData ?? []) {
        if (!insuranceByStore[p.store_id]) insuranceByStore[p.store_id] = [];
        insuranceByStore[p.store_id].push(p);
      }

      setAlerts(
        generatePortfolioAlerts(stores, leasesByStore, equipmentByStore, insuranceByStore)
      );
    } catch {
      setLoadError(true);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [stores, supabase]);

  useEffect(() => {
    if (storesLoading) return;
    loadData();
  }, [storesLoading, loadData]);

  const { active, resolved } = useMemo(() => {
    const activeItems = alerts.filter((a) => !a.resolved && (a.severity === "danger" || a.severity === "warning" || a.severity === "info"));
    const resolvedItems = alerts.filter((a) => a.resolved || a.severity === "success");
    return { active: activeItems, resolved: resolvedItems };
  }, [alerts]);

  function navigateToAlert(alert: AlertItem) {
    if (!alert.action) return;
    const store = stores.find((s) => String(s.id) === String(alert.storeId));
    if (store) {
      setSelectedStore(store);
      setIsAllStores(false);
    }
    router.push(`/${alert.action}`);
  }

  if (storesLoading || loading) {
    return (
      <div className="space-y-5 max-w-3xl w-full">
        <LoadingSkeleton variant="card" />
      </div>
    );
  }

  if (loadError) {
    return <PageError onRetry={loadData} />;
  }

  if (stores.length === 0) {
    return (
      <div className="space-y-5 max-w-3xl w-full">
        <EmptyState
          icon="Store"
          title="No stores yet"
          description="Add a store to start receiving alerts."
          ctaLabel="Add Your First Store"
          ctaHref="/portfolio"
        />
      </div>
    );
  }

  if (active.length === 0 && resolved.length === 0) {
    return (
      <div className="space-y-5 max-w-3xl w-full">
        <h1 className="text-[15px] font-semibold text-slate-100">Active Alerts</h1>
        <EmptyState
          icon="Bell"
          title="No alerts right now"
          description="Your store looks healthy — we will notify you when something needs attention"
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl w-full">
      <div className="flex items-center gap-3">
        <h1 className="text-[15px] font-semibold text-slate-100">Active Alerts</h1>
        {active.length > 0 && <span className="badge badge-red">{active.length} Active</span>}
      </div>

      {active.length === 0 ? (
        <EmptyState
          icon="Bell"
          title="No alerts right now"
          description="Your store looks healthy — we will notify you when something needs attention"
        />
      ) : (
        <div className="space-y-3">
          {active.map((alert) => {
            const style = severityStyles[alert.severity] ?? severityStyles.info;
            return (
              <div
                key={alert.id}
                className={clsx("card flex items-start gap-4", style.border && `border ${style.border}`)}
              >
                <div
                  className={clsx(
                    "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                    style.bg
                  )}
                >
                  <AlertSeverityIcon severity={alert.severity} />
                </div>
                <div className="flex-1 min-w-0">
                  {alert.storeName && (
                    <div className="text-[10px] uppercase tracking-wider text-gray-700 dark:text-slate-500 mb-0.5">
                      {alert.storeName}
                    </div>
                  )}
                  <div className="text-[13px] font-semibold text-slate-100">{alert.title}</div>
                  <div className="text-[12px] text-gray-700 dark:text-gray-800 dark:text-slate-400 mt-1 leading-relaxed">{alert.body}</div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {alert.tags.map((tag) => (
                      <span key={tag} className={`badge ${tagStyles[alert.severity] ?? "badge-blue"}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                {alert.action && (
                  <button
                    type="button"
                    onClick={() => navigateToAlert(alert)}
                    className="btn-outline flex-shrink-0 text-[11px] whitespace-nowrap"
                  >
                    {alert.actionLabel} →
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="mt-6">
          <h2 className="text-[13px] font-semibold text-gray-700 dark:text-slate-500 mb-3">Healthy / Resolved</h2>
          <div className="space-y-3">
            {resolved.map((alert) => (
              <div key={alert.id} className="card opacity-60 flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/5">
                  <AlertSeverityIcon severity={alert.severity} />
                </div>
                <div className="flex-1">
                  {alert.storeName && (
                    <div className="text-[10px] uppercase tracking-wider text-gray-700 dark:text-slate-600 mb-0.5">
                      {alert.storeName}
                    </div>
                  )}
                  <div className="text-[13px] font-semibold text-gray-700 dark:text-gray-800 dark:text-slate-400">{alert.title}</div>
                  <div className="text-[12px] text-gray-700 dark:text-slate-600 mt-1">{alert.body}</div>
                </div>
                <span className="badge badge-green flex-shrink-0">Healthy</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card mt-6">
        <div className="section-title">Alert Thresholds</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            ["DSCR Minimum", "1.25x"],
            ["Global DSCR Minimum", "1.25x"],
            ["Utility Alert", "> 20%"],
            ["Occupancy Cost Alert", "> 20%"],
            ["Lease Warning", "< 5 years"],
            ["Rent Escalation", "≤ 6 months"],
            ["Equip. Age Warning", "> 12 years"],
          ].map(([label, val]) => (
            <div key={label} className="card2">
              <div className="metric-label">{label}</div>
              <div className="text-[14px] font-semibold text-slate-900 dark:text-slate-200">{val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
