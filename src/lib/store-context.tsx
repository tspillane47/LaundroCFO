"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { getCachedSessionUser } from "@/lib/session-cache";
import { useSession } from "@/lib/session-context";
import { createClient } from "@/lib/supabase";
import { fetchAccessibleStores } from "@/lib/store-access";

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
  const session = useSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [stores, setStores] = useState<any[]>([]);
  const [selectedStore, setSelectedStore] = useState<any | null>(null);
  const [isAllStores, setIsAllStores] = useState(true);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const awaitingSessionUser = Boolean(session && session.loading && !session.user);

  async function loadStores() {
    const user = sessionRef.current
      ? sessionRef.current.user
      : await getCachedSessionUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data } = await fetchAccessibleStores(supabase);
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

  useEffect(() => {
    if (awaitingSessionUser) return;
    void loadStores();
  }, [awaitingSessionUser, session?.user?.id]);

  useEffect(() => {
    // Skip until loadStores finishes — initial isAllStores=true would wipe sessionStorage
    // before the persisted store id is read back on full page refresh.
    if (loading) return;

    if (isAllStores || !selectedStore?.id) {
      writePersistedStoreId(null);
      return;
    }
    writePersistedStoreId(selectedStore.id);
  }, [selectedStore?.id, isAllStores, loading]);

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
