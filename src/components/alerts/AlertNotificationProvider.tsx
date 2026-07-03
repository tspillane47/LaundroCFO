"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase";
import { evaluatePortfolioAlerts } from "@/lib/alertEvaluation";
import { useStores } from "@/lib/store-context";
import { useToast } from "@/components/ui/ToastProvider";

type AlertEvaluationContextValue = {
  evaluateAlerts: (options?: { storeIds?: string[] }) => Promise<void>;
};

const AlertEvaluationContext = createContext<AlertEvaluationContextValue | null>(null);

export function AlertNotificationProvider({ children }: { children: ReactNode }) {
  const supabase = createClient();
  const toast = useToast();
  const { stores, loading } = useStores();
  const initialRunRef = useRef(false);
  const runningRef = useRef(false);

  const evaluateAlerts = useCallback(
    async (options?: { storeIds?: string[] }) => {
      if (runningRef.current || stores.length === 0) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      runningRef.current = true;
      try {
        await evaluatePortfolioAlerts(supabase, {
          userId: user.id,
          stores,
          toast,
          storeIds: options?.storeIds,
        });
      } catch (error) {
        console.error("Alert evaluation failed:", error);
      } finally {
        runningRef.current = false;
      }
    },
    [stores, supabase, toast]
  );

  useEffect(() => {
    if (loading || stores.length === 0 || initialRunRef.current) return;
    initialRunRef.current = true;
    void evaluateAlerts();
  }, [loading, stores, evaluateAlerts]);

  return (
    <AlertEvaluationContext.Provider value={{ evaluateAlerts }}>
      {children}
    </AlertEvaluationContext.Provider>
  );
}

export function useAlertEvaluation(): AlertEvaluationContextValue {
  const ctx = useContext(AlertEvaluationContext);
  if (!ctx) {
    throw new Error("useAlertEvaluation must be used within AlertNotificationProvider");
  }
  return ctx;
}
