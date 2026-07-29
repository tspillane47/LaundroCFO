"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

const SELECTED_STORE_STORAGE_KEY = "laundrocfo:selected-store-id";

function readPersistedStoreId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(SELECTED_STORE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writePersistedStoreId(storeId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (storeId) {
      sessionStorage.setItem(SELECTED_STORE_STORAGE_KEY, storeId);
    } else {
      sessionStorage.removeItem(SELECTED_STORE_STORAGE_KEY);
    }
  } catch {
    // ignore storage failures (private browsing, quota, etc.)
  }
}

interface StoreContextType {
  stores: any[];
  selectedStore: any | null;
  setSelectedStore: (store: any | null) => void;
  isAllStores: boolean;
  setIsAllStores: (val: boolean) => void;
  loading: boolean;
  refreshStores: () => void;
}

const StoreContext = createContext<StoreContextType>({
  stores: [],
  selectedStore: null,
  setSelectedStore: () => {},
  isAllStores: true,
  setIsAllStores: () => {},
  loading: true,
  refreshStores: () => {},
});

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [stores, setStores] = useState<any[]>([]);
  const [selectedStore, setSelectedStore] = useState<any | null>(null);
  const [isAllStores, setIsAllStores] = useState(true);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  async function loadStores() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("stores")
      .select("*")
      .eq("user_id", user.id)
      .or("archived.is.null,archived.eq.false");
    if (data) {
      setStores(data);
      if (data.length === 1) {
        setSelectedStore(data[0]);
        setIsAllStores(false);
      } else {
        const persistedId = readPersistedStoreId();
        const persistedStore = persistedId ? data.find((s) => s.id === persistedId) : null;
        if (persistedStore) {
          setSelectedStore(persistedStore);
          setIsAllStores(false);
        } else {
          setSelectedStore((current: any | null) => {
            if (current && !data.some((s) => s.id === current.id)) {
              setIsAllStores(true);
              writePersistedStoreId(null);
              return null;
            }
            return current;
          });
        }
      }
    }
    setLoading(false);
  }

  useEffect(() => { loadStores(); }, []);

  useEffect(() => {
    if (isAllStores || !selectedStore?.id) {
      writePersistedStoreId(null);
      return;
    }
    writePersistedStoreId(selectedStore.id);
  }, [selectedStore?.id, isAllStores]);

  return (
    <StoreContext.Provider value={{
      stores, selectedStore, setSelectedStore,
      isAllStores, setIsAllStores, loading,
      refreshStores: loadStores
    }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStores() { return useContext(StoreContext); }
