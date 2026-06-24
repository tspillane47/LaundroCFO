"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { createClient } from "@/lib/supabase";
import { useStores } from "@/lib/store-context";
import { generatePortfolioAlerts, type AlertItem } from "@/lib/alerts";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { PageError } from "@/components/ui/PageError";

const severityStyles: Record<string, { icon: string; bg: string; border: string }> = {
  danger: { icon: "bg-red-500/15", bg: "", border: "border-red-500/20" },
  warning: { icon: "bg-amber-500/15", bg: "", border: "border-amber-500/20" },
  info: { icon: "bg-blue-500/15", bg: "", border: "border-blue-500/20" },
  success: { icon: "bg-green-500/15", bg: "", border: "" },
};

const tagStyles: Record<string, string> = {
  danger: "badge-red",
  warning: "badge-amber",
  info: "badge-blue",
  success: "badge-green",
};

export default function AlertsPage() {
  const supabase = createClient();
  const { stores, loading: storesLoading } = useStores();
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

  if (storesLoading || loading) {
    return (
      <div className="space-y-5 max-w-3xl">
        <CardSkeleton />
        {Array.from({ length: 3 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (loadError) {
    return <PageError onRetry={loadData} />;
  }

  if (stores.length === 0) {
    return (
      <div className="card text-center py-10 max-w-3xl">
        <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
          Add a store to start receiving alerts
        </p>
      </div>
    );
  }

  if (active.length === 0 && resolved.length === 0) {
    return (
      <div className="space-y-5 max-w-3xl">
        <h1 className="text-[15px] font-semibold text-slate-100">Active Alerts</h1>
        <div className="card text-center py-10">
          <p className="text-[14px] text-green-400 font-medium">
            No active alerts — your portfolio looks healthy.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <h1 className="text-[15px] font-semibold text-slate-100">Active Alerts</h1>
        {active.length > 0 && <span className="badge badge-red">{active.length} Active</span>}
      </div>

      {active.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-[14px] text-green-400 font-medium">
            No active alerts — your portfolio looks healthy.
          </p>
        </div>
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
                    "w-10 h-10 rounded-xl flex items-center justify-center text-[18px] flex-shrink-0",
                    style.icon
                  )}
                >
                  {alert.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  {alert.storeName && (
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">
                      {alert.storeName}
                    </div>
                  )}
                  <div className="text-[13px] font-semibold text-slate-100">{alert.title}</div>
                  <div className="text-[12px] text-slate-400 mt-1 leading-relaxed">{alert.body}</div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {alert.tags.map((tag) => (
                      <span key={tag} className={`badge ${tagStyles[alert.severity] ?? "badge-blue"}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                {alert.action && (
                  <Link
                    href={`/${alert.action}`}
                    className="btn-outline flex-shrink-0 text-[11px] whitespace-nowrap"
                  >
                    {alert.actionLabel} →
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="mt-6">
          <h2 className="text-[13px] font-semibold text-slate-500 mb-3">Healthy / Resolved</h2>
          <div className="space-y-3">
            {resolved.map((alert) => (
              <div key={alert.id} className="card opacity-60 flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[18px] flex-shrink-0 bg-white/5">
                  {alert.emoji}
                </div>
                <div className="flex-1">
                  {alert.storeName && (
                    <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-0.5">
                      {alert.storeName}
                    </div>
                  )}
                  <div className="text-[13px] font-semibold text-slate-400">{alert.title}</div>
                  <div className="text-[12px] text-slate-600 mt-1">{alert.body}</div>
                </div>
                <span className="badge badge-green flex-shrink-0">Healthy</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card mt-6">
        <div className="section-title">Alert Thresholds</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            ["DSCR Minimum", "1.25x"],
            ["Global DSCR Minimum", "1.25x"],
            ["Utility Alert", "> 20%"],
            ["Occupancy Cost Alert", "> 20%"],
            ["Lease Warning", "< 5 years"],
            ["Equip. Age Warning", "> 12 years"],
          ].map(([label, val]) => (
            <div key={label} className="card2">
              <div className="metric-label">{label}</div>
              <div className="text-[14px] font-semibold text-slate-200">{val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
