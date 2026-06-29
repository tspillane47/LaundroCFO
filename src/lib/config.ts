export const BETA_MODE = true;

export const PLANS = {
  starter: { name: "Starter", price: 29, maxStores: 1 },
  pro: { name: "Pro", price: 59, maxStores: 3 },
  growth: { name: "Growth", price: 99, maxStores: null },
} as const;
