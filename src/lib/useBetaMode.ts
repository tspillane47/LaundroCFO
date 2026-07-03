"use client";

import { useCallback, useEffect, useState } from "react";
import { BETA_MODE as BETA_MODE_FALLBACK } from "@/lib/config";
import { parseBetaSettingValue, BETA_MODE_SETTING_KEY } from "@/lib/beta";
import { createClient } from "@/lib/supabase";

const REVALIDATE_MS = 60_000;

type BetaModeCache = {
  value: boolean;
  fetchedAt: number;
  promise?: Promise<boolean>;
};

let betaModeCache: BetaModeCache | null = null;

async function fetchBetaModeFromDb(): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", BETA_MODE_SETTING_KEY)
    .maybeSingle();

  if (error) return BETA_MODE_FALLBACK;
  return parseBetaSettingValue(data?.value);
}

export function invalidateBetaModeCache() {
  betaModeCache = null;
}

export function useBetaMode() {
  const [betaMode, setBetaMode] = useState(
    betaModeCache?.value ?? BETA_MODE_FALLBACK
  );
  const [loading, setLoading] = useState(betaModeCache === null);

  useEffect(() => {
    let cancelled = false;

    async function load(force = false) {
      const now = Date.now();
      if (
        !force &&
        betaModeCache &&
        !betaModeCache.promise &&
        now - betaModeCache.fetchedAt < REVALIDATE_MS
      ) {
        setBetaMode(betaModeCache.value);
        setLoading(false);
        return;
      }

      if (!force && betaModeCache?.promise) {
        const value = await betaModeCache.promise;
        if (!cancelled) {
          setBetaMode(value);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const promise = fetchBetaModeFromDb();
      betaModeCache = {
        value: BETA_MODE_FALLBACK,
        fetchedAt: now,
        promise,
      };

      const value = await promise;
      betaModeCache = { value, fetchedAt: Date.now() };

      if (!cancelled) {
        setBetaMode(value);
        setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    invalidateBetaModeCache();
    const value = await fetchBetaModeFromDb();
    betaModeCache = { value, fetchedAt: Date.now() };
    setBetaMode(value);
    setLoading(false);
  }, []);

  return { betaMode, loading, refresh };
}
