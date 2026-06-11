"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useStores } from "@/lib/store-context";
import { OccupancySelector, type OccupancyType } from "@/components/occupancy/OccupancySelector";
import { LeaseModule } from "@/components/occupancy/LeaseModule";
import { RealEstateModule } from "@/components/occupancy/RealEstateModule";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
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
  const [error, setError] = useState("");
  const [store, setStore] = useState<Store | null>(null);
  const [showSelector, setShowSelector] = useState(false);
  const [hasLease, setHasLease] = useState(false);
  const [editTrigger, setEditTrigger] = useState(0);

  async function loadStore() {
    setLoading(true);
    setLoadError(false);
    setError("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      if (!selectedStore?.id) {
        setError("Select a store from the dropdown above.");
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
    if (!store) return;
    setSavingType(true);
    setError("");

    const { error: updateError } = await supabase
      .from("stores")
      .update({ occupancy_type: type })
      .eq("id", store.id);

    if (updateError) {
      setError(updateError.message);
      setSavingType(false);
      return;
    }

    setStore((s) => (s ? { ...s, occupancy_type: type } : s));
    setShowSelector(false);
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
        <LoadingSkeleton rows={4} />
      </div>
    );
  }

  if (loadError) {
    return <PageError onRetry={loadStore} />;
  }

  if (!store) {
    return (
      <div className="card text-center py-12">
        <div className="text-slate-300 text-[14px]">No store found.</div>
        <p className="text-slate-500 text-[13px] mt-2">
          Complete onboarding to manage occupancy and real estate.
        </p>
      </div>
    );
  }

  const isLeased = store.occupancy_type === "leased" && !showSelector;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-semibold text-slate-100">Occupancy & Real Estate</h1>
          <p className="text-slate-500 text-[13px] mt-0.5">
            {store.address ?? "Store address not set"}
            {store.occupancy_type && !showSelector && (
              <span className="text-slate-600"> · {OCCUPANCY_LABELS[store.occupancy_type]}</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {isLeased && (
            <button onClick={triggerLeaseEdit} className="btn-primary">
              {hasLease ? "Edit Lease" : "Set Up Your Lease →"}
            </button>
          )}
          {store.occupancy_type && !showSelector && (
            <button onClick={handleChangeOccupancyType} className="btn-outline">
              Change Occupancy Type
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-[12px] text-red-400">
          {error}
        </div>
      )}

      {showSelector ? (
        <OccupancySelector saving={savingType} onSelect={handleSelectOccupancy} />
      ) : store.occupancy_type === "leased" ? (
        <>
          {!hasLease && (
            <div className="card text-center py-16">
              <div className="text-[40px] mb-4">📋</div>
              <div className="text-slate-200 text-[16px] font-semibold mb-2">No lease on file yet</div>
              <p className="text-slate-500 text-[13px] mb-6 max-w-sm mx-auto">
                Add your lease terms to calculate risk score and track renewal options.
              </p>
              <button onClick={triggerLeaseEdit} className="btn-primary px-8 py-3 text-[14px]">
                Set Up Your Lease →
              </button>
            </div>
          )}
          <LeaseModule
            store={store}
            editTrigger={editTrigger}
            hideHeader
            onLeaseStatus={setHasLease}
          />
        </>
      ) : store.occupancy_type === "owner_occupied" ? (
        <RealEstateModule store={store} />
      ) : null}
    </div>
  );
}
