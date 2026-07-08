"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useStores } from "@/lib/store-context";
import { FormBanner } from "@/components/ui/FormBanner";
import { AddStoreLink } from "@/components/ui/AddStoreLink";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { ReadOnlyGuard } from "@/components/ui/ReadOnlyGuard";
import { useWriteGuard } from "@/lib/useWriteGuard";

type StoreRow = {
  id: string;
  name: string | null;
  address: string | null;
  archived: boolean | null;
  created_at: string | null;
};

function parseCityState(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return parts.slice(-2).join(", ");
  }
  return null;
}

function formatAddedDate(createdAt: string | null): string {
  if (!createdAt) return "Added —";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "Added —";
  return `Added ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

export default function ManageStoresPage() {
  const router = useRouter();
  const supabase = createClient();
  const { selectedStore, setSelectedStore, setIsAllStores, refreshStores } = useStores();
  const { canWrite, blockedReason } = useWriteGuard();

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StoreRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadStores = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const { data, error } = await supabase
      .from("stores")
      .select("id, name, address, archived, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      setMessage({ type: "error", text: "We couldn't load your stores. Please try again." });
    } else {
      setStores((data ?? []) as StoreRow[]);
    }
    setLoading(false);
  }, [router, supabase]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [message]);

  async function handleToggleArchive(store: StoreRow) {
    if (!canWrite) {
      setMessage({ type: "error", text: blockedReason ?? "Subscribe to make changes." });
      return;
    }
    setTogglingId(store.id);
    setMessage(null);

    const { error } = await supabase
      .from("stores")
      .update({ archived: !store.archived })
      .eq("id", store.id);

    if (error) {
      setMessage({ type: "error", text: "We couldn't update this store. Please try again." });
    } else {
      if (selectedStore?.id === store.id && !store.archived) {
        setSelectedStore(null);
        setIsAllStores(true);
      }
      await refreshStores();
      await loadStores();
    }
    setTogglingId(null);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget || deleting) return;
    if (!canWrite) {
      setMessage({ type: "error", text: blockedReason ?? "Subscribe to make changes." });
      return;
    }
    setDeleting(true);
    setMessage(null);

    const { error } = await supabase.from("stores").delete().eq("id", deleteTarget.id);

    if (error) {
      setMessage({ type: "error", text: "We couldn't delete this store. Please try again." });
      setDeleting(false);
      return;
    }

    if (selectedStore?.id === deleteTarget.id) {
      const remaining = stores.filter((s) => s.id !== deleteTarget.id && !s.archived);
      if (remaining.length === 1) {
        setSelectedStore(remaining[0]);
        setIsAllStores(false);
      } else {
        setSelectedStore(null);
        setIsAllStores(true);
      }
    }

    setDeleteTarget(null);
    setMessage({ type: "success", text: "Store deleted" });
    await refreshStores();
    await loadStores();
    setDeleting(false);
  }

  if (loading) {
    return <LoadingSkeleton rows={4} />;
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
            Manage Stores
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            View, archive, or remove stores from your portfolio
          </p>
        </div>
        <AddStoreLink className="btn-primary text-[13px] flex-shrink-0" />
      </div>

      <FormBanner message={message} />

      {stores.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
            No stores yet.
          </p>
          <AddStoreLink firstStore className="btn-primary inline-flex mt-4 text-[13px]">
            Add Your First Store →
          </AddStoreLink>
        </div>
      ) : (
        <div className="space-y-3">
          {stores.map((store) => {
            const cityState = parseCityState(store.address);
            const isArchived = store.archived === true;

            return (
              <div
                key={store.id}
                className="card"
                style={{
                  opacity: isArchived ? 0.6 : 1,
                  padding: "20px 24px",
                }}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="text-[15px] font-bold truncate"
                        style={{ color: "var(--text-primary)", maxWidth: "100%" }}
                      >
                        {store.name ?? "Unnamed Store"}
                      </div>
                      {isArchived && (
                        <span className="badge badge-amber text-[10px] flex-shrink-0">Archived</span>
                      )}
                    </div>
                    {store.address && (
                      <div
                        className="text-[13px] truncate"
                        style={{ color: "var(--text-secondary)", maxWidth: "100%" }}
                      >
                        {store.address}
                      </div>
                    )}
                    {cityState && (
                      <div className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {cityState}
                      </div>
                    )}
                    <div className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
                      {formatAddedDate(store.created_at)}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 flex-shrink-0">
                    <Link
                      href={`/settings/edit-store?store=${store.id}`}
                      className="btn-outline text-[12px] px-3 py-1.5"
                    >
                      Edit
                    </Link>
                    <ReadOnlyGuard>
                      <button
                        type="button"
                        onClick={() => handleToggleArchive(store)}
                        disabled={togglingId === store.id}
                        className="btn-outline text-[12px] px-3 py-1.5 disabled:opacity-40"
                      >
                        {togglingId === store.id
                          ? "Updating..."
                          : isArchived
                            ? "Unarchive"
                            : "Archive"}
                      </button>
                    </ReadOnlyGuard>
                    <ReadOnlyGuard>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(store)}
                        className="btn-outline text-[12px] px-3 py-1.5 text-red-400 border-red-500/20"
                      >
                        Delete
                      </button>
                    </ReadOnlyGuard>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="card w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[16px] font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
              Delete {deleteTarget.name ?? "this store"}?
            </h2>
            <p className="text-[13px] mb-6" style={{ color: "var(--text-secondary)" }}>
              This will permanently delete this store and all related records including leases,
              equipment, financials, insurance, and valuations. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="btn-outline flex-1"
              >
                Cancel
              </button>
              <ReadOnlyGuard align="stretch">
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={deleting}
                  className="flex-1 rounded-lg px-4 py-2.5 text-[13px] font-medium text-white disabled:opacity-40"
                  style={{ background: "var(--text-danger)" }}
                >
                  {deleting ? "Deleting..." : "Delete Store"}
                </button>
              </ReadOnlyGuard>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
