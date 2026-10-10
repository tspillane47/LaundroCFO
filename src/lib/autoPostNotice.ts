import { fmtDollar } from "@/lib/calculations";

export type AutoPostNotice = {
  storeId: string;
  postedCount: number;
  postedAmount: number;
  transactionIds: string[];
};

const STORAGE_KEY = "laundrocfo.autoPostNotice";

export function formatAutoPostBanner(postedCount: number, postedAmount: number): string {
  const noun = postedCount === 1 ? "deposit" : "deposits";
  return `${postedCount} ${noun} posted automatically (${fmtDollar(postedAmount)}).`;
}

export function saveAutoPostNotice(notice: AutoPostNotice) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(notice));
}

export function readAutoPostNotice(storeId: string): AutoPostNotice | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AutoPostNotice;
    if (!parsed || parsed.storeId !== storeId || !(parsed.postedCount > 0)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearAutoPostNotice() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}
