"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { invalidateValuationCache } from "@/lib/getStoreValuation";
import { useRouter } from "next/navigation";
import { useStores } from "@/lib/store-context";
import { OccupancySelector, type OccupancyType } from "@/components/occupancy/OccupancySelector";
import { LeaseModule } from "@/components/occupancy/LeaseModule";
import { RealEstateModule } from "@/components/occupancy/RealEstateModule";
import { FormBanner } from "@/components/ui/FormBanner";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageError } from "@/components/ui/PageError";

type Store = {
  id: string;
  address: string | null;
  monthly_revenue: number | null;
  monthly_expenses: number | null;
  occupancy_type: OccupancyType | null;
};

const OCCUPANCY_LABELS: Record<OccupancyType, string> = {
  leased: "Leased Location",
  owner_occupied: "Owner-Occupied / Related-Party Real Estate",
};

export default function OccupancyPage() {
  const router = useRouter();
  const supabase = createClient();
  const { selectedStore } = useStores();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingType, setSavingType] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [showSelector, setShowSelector] = useState(false);
  const [hasLease, setHasLease] = useState(false);
  const [editTrigger, setEditTrigger] = useState(0);

  async function loadStore() {
    setLoading(true);
    setLoadError(false);
    setMessage(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      if (!selectedStore?.id) {
        setMessage({ type: "error", text: "Select a store from the dropdown above." });
        setStore(null);
        return;
      }

      const { data: storeData, error: storeError } = await supabase
        .from("stores")
        .select("id, address, monthly_revenue, monthly_expenses, occupancy_type")
        .eq("id", selectedStore.id)
        .single();

      if (storeError) throw storeError;
      if (!storeData) throw new Error("No store found");

      setStore(storeData);
      setShowSelector(!storeData.occupancy_type);
    } catch {
      setLoadError(true);
      setStore(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStore();
  }, [selectedStore?.id]);

  async function handleSelectOccupancy(type: OccupancyType) {
    if (!store || savingType) return;
    setSavingType(true);
    setMessage(null);

    const { error: updateError } = await supabase
      .from("stores")
      .update({ occupancy_type: type })
      .eq("id", store.id);

    if (updateError) {
      setMessage({ type: "error", text: "We couldn't save this. Please try again." });
      setSavingType(false);
      return;
    }

    invalidateValuationCache(store.id);
    setStore((s) => (s ? { ...s, occupancy_type: type } : s));
    setShowSelector(false);
    setMessage({ type: "success", text: "Saved successfully." });
    setTimeout(() => setMessage(null), 3000);
    setSavingType(false);
  }

  async function handleChangeOccupancyType() {
    setShowSelector(true);
  }

  function triggerLeaseEdit() {
    setEditTrigger((t) => t + 1);
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <LoadingSkeleton key={i} variant="metric-card" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <LoadingSkeleton key={i} variant="metric-card" />
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return <PageError onRetry={loadStore} />;
  }

  if (!store) {
    return (
      <div className="card text-center py-12">
        <div className="text-[var(--text-secondary)] text-[14px]">No store found.</div>
        <p className="text-[var(--text-muted)] text-[13px] mt-2">
          Complete onboarding to manage occupancy and real estate.
        </p>
      </div>
    );
  }

  if (!showSelector && store.occupancy_type === "leased" && !hasLease) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-[15px] font-semibold text-slate-100">Occupancy & Real Estate</h1>
            <p className="text-[var(--text-muted)] text-[14px] md:text-[13px] mt-0.5">
              {store.address ?? "Store address not set"}
            </p>
          </div>
          <button type="button" onClick={triggerLeaseEdit} className="btn-primary w-full sm:w-auto">
            Set Up Your Lease →
          </button>
        </div>
        <FormBanner message={message} />
        <EmptyState
          icon="FileText"
          title="No lease information yet"
          description="Add your lease details to track rent and expiration dates"
          ctaLabel="Add Lease"
          ctaHref="/occupancy"
        />
        <LeaseModule
          store={store}
          editTrigger={editTrigger}
          hideHeader
          onLeaseStatus={setHasLease}
        />
      </div>
    );
  }

  const isLeased = store.occupancy_type === "leased" && !showSelector;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-[15px] font-semibold text-slate-100">Occupancy & Real Estate</h1>
          <p className="text-[var(--text-muted)] text-[14px] md:text-[13px] mt-0.5">
            {store.address ?? "Store address not set"}
            {store.occupancy_type && !showSelector && (
              <span className="text-[var(--text-muted)]"> · {OCCUPANCY_LABELS[store.occupancy_type]}</span>
            )}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {isLeased && (
            <button type="button" onClick={triggerLeaseEdit} className="btn-primary w-full sm:w-auto">
              {hasLease ? "Edit Lease" : "Set Up Your Lease →"}
            </button>
          )}
          {store.occupancy_type && !showSelector && (
            <button type="button" onClick={handleChangeOccupancyType} className="btn-outline w-full sm:w-auto">
              Change Occupancy Type
            </button>
          )}
        </div>
      </div>

      <FormBanner message={message} />

      {showSelector ? (
        <OccupancySelector saving={savingType} onSelect={handleSelectOccupancy} />
      ) : store.occupancy_type === "leased" ? (
        <LeaseModule
          store={store}
          editTrigger={editTrigger}
          hideHeader
          onLeaseStatus={setHasLease}
        />
      ) : store.occupancy_type === "owner_occupied" ? (
        <RealEstateModule store={store} />
      ) : null}
    </div>
  );
}
