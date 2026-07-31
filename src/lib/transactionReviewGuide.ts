export type TransactionCategoryGuideItem = {
  name: string;
  description: string;
};

export const TRANSACTION_REVIEW_FLOW_STEPS = [
  { id: "import", label: "Import", description: "Bank, QuickBooks, or CSV" },
  { id: "review", label: "Needs Review", description: "New items land here first" },
  { id: "categorize", label: "Categorize", description: "Pick the right bucket" },
  { id: "post", label: "Post to P&L", description: "Updates your financials" },
] as const;

export const TRANSACTION_CATEGORY_GUIDE: TransactionCategoryGuideItem[] = [
  {
    name: "Self-Service Revenue",
    description: "Coin-op or card wash and dry income from your machines.",
  },
  {
    name: "WDF Revenue",
    description: "Wash-dry-fold service you do for customers.",
  },
  {
    name: "Commercial Revenue",
    description: "Business contracts — hotels, restaurants, linen services, and similar accounts.",
  },
  {
    name: "Vending Revenue",
    description: "Income from soap, snacks, or other vending machines.",
  },
  {
    name: "Utilities",
    description: "Water, gas, and electric bills for the store. Categorize them here — not in a separate utilities-only workflow.",
  },
  {
    name: "Exclude",
    description: "Personal purchases or anything unrelated to running the laundromat.",
  },
];

export const TRANSACTION_REVIEW_TIPS = [
  "Sort revenue by type: Self-Service, WDF, Commercial, or Vending",
  "Don't forget: utility bills belong here too",
  "Exclude anything unrelated to the laundromat business",
  "Click Post (or Post Selected) once transactions are categorized — this is what updates your P&L",
] as const;
