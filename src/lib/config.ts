export const BETA_MODE = true; // Fallback default when app_settings.beta_mode cannot be read

export const PLANS = {
  starter: { name: "Starter", price: 29, maxStores: 1 },
  pro: { name: "Pro", price: 59, maxStores: 3 },
  growth: { name: "Growth", price: 99, maxStores: null },
} as const;
