"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

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
    if (!user) return;
    const { data } = await supabase.from("stores").select("*").eq("user_id", user.id);
    if (data) {
      setStores(data);
      if (data.length === 1) {
        setSelectedStore(data[0]);
        setIsAllStores(false);
      }
    }
    setLoading(false);
  }

  useEffect(() => { loadStores(); }, []);

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
