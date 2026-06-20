export type MonthlyFinancialRecord = {
  id: string;
  store_id: string;
  user_id?: string;
  year: number;
  month: number;
  revenue: number;
  self_service_revenue: number;
  wdf_revenue: number;
  commercial_revenue: number;
  vending_revenue: number;
  other_revenue: number;
  utilities: number;
  rent: number;
  payroll: number;
  repairs_maintenance: number;
  insurance_expense: number;
  supplies: number;
  marketing: number;
  professional_fees: number;
  software_subscriptions: number;
  cc_processing_fees: number;
  bank_charges: number;
  other_expenses: number;
  debt_service: number;
  notes?: string | null;
};

export type MonthlyUtilityRecord = {
  year: number;
  month: number;
  water: number;
  gas: number;
  electric: number;
  sewer: number;
  trash: number;
  internet: number;
};

export type CalculatedMonthly = MonthlyFinancialRecord & {
  totalExpenses: number;
  grossProfit: number;
  ebitda: number;
  ebitdaMargin: number;
  noi: number;
  netCashFlow: number;
};

export type TtmMetrics = {
  ttmRevenue: number;
  ttmEbitda: number;
  ttmEbitdaMargin: number;
  ttmDebtService: number;
  ttmNoi: number;
  dscr: number;
  monthsUsed: number;
};

export type FinancialRatios = {
  rentPct: number;
  utilityPct: number;
  payrollPct: number;
  revenuePerSF: number;
  ebitdaPerSF: number;
  totalMachines: number;
  revenuePerMachine: number;
  revenuePerWasher: number;
  revenuePerDryer: number;
  annualRent: number;
  annualUtilities: number;
  annualPayroll: number;
};

export type TransactionStatus =
  | "needs_review"
  | "reviewed"
  | "posted"
  | "excluded"
  | "system_classified"
  | "user_classified";

export type TransactionChangeSource = "user" | "rule" | "import";

export type BankTransaction = {
  id: string;
  store_id: string;
  user_id?: string;
  transaction_date: string;
  description: string | null;
  amount: number;
  category: string | null;
  is_reviewed: boolean;
  status?: TransactionStatus;
  excluded?: boolean;
  exclusion_reason?: string | null;
  notes?: string | null;
  original_category?: string | null;
  transaction_type?: TransactionType | null;
  split_parent_id?: string | null;
  modified_at?: string;
};

export type TransactionPlLink = {
  id: string;
  transaction_id: string;
  store_id: string;
  year: number;
  month: number;
  category: string;
  amount_applied: number;
  applied_at: string;
};

export type TransactionAuditLogEntry = {
  id: string;
  transaction_id: string;
  store_id: string;
  user_id: string;
  changed_at: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  change_source: TransactionChangeSource;
};

export type StoreFinancialProfile = {
  id: string;
  name: string | null;
  square_footage: number | null;
  washers: number | null;
  dryers: number | null;
  monthly_revenue?: number | null;
  monthly_expenses?: number | null;
  monthly_rent?: number | null;
  annual_debt_service?: number | null;
};

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function num(value: number | null | undefined): number {
  return value ?? 0;
}

export function calcMonthly(record: MonthlyFinancialRecord): CalculatedMonthly {
  const self_service_revenue = num(record.self_service_revenue);
  const wdf_revenue = num(record.wdf_revenue);
  const commercial_revenue = num(record.commercial_revenue);
  const vending_revenue = num(record.vending_revenue);
  const other_revenue = num(record.other_revenue);
  const revenue =
    num(record.revenue) ||
    self_service_revenue +
      wdf_revenue +
      commercial_revenue +
      vending_revenue +
      other_revenue;
  const utilities = num(record.utilities);
  const rent = num(record.rent);
  const payroll = num(record.payroll);
  const repairs_maintenance = num(record.repairs_maintenance);
  const insurance_expense = num(record.insurance_expense);
  const supplies = num(record.supplies);
  const marketing = num(record.marketing);
  const professional_fees = num(record.professional_fees);
  const software_subscriptions = num(record.software_subscriptions);
  const cc_processing_fees = num(record.cc_processing_fees);
  const bank_charges = num(record.bank_charges);
  const other_expenses = num(record.other_expenses);
  const debt_service = num(record.debt_service);

  const totalExpenses =
    utilities +
    rent +
    payroll +
    repairs_maintenance +
    insurance_expense +
    supplies +
    marketing +
    professional_fees +
    software_subscriptions +
    cc_processing_fees +
    bank_charges +
    other_expenses;

  const grossProfit = revenue - utilities - supplies - repairs_maintenance;
  const ebitda = revenue - totalExpenses;
  const ebitdaMargin = revenue > 0 ? (ebitda / revenue) * 100 : 0;
  const noi = ebitda - debt_service;

  return {
    ...record,
    revenue,
    self_service_revenue,
    wdf_revenue,
    commercial_revenue,
    vending_revenue,
    other_revenue,
    utilities,
    rent,
    payroll,
    repairs_maintenance,
    insurance_expense,
    supplies,
    marketing,
    professional_fees,
    software_subscriptions,
    cc_processing_fees,
    bank_charges,
    other_expenses,
    debt_service,
    totalExpenses,
    grossProfit,
    ebitda,
    ebitdaMargin,
    noi,
    netCashFlow: noi,
  };
}

export function utilityRecordTotal(rec: MonthlyUtilityRecord): number {
  return (
    num(rec.water) +
    num(rec.gas) +
    num(rec.electric) +
    num(rec.sewer) +
    num(rec.trash) +
    num(rec.internet)
  );
}

export function resolveUtilitiesAmount(
  record: MonthlyFinancialRecord,
  utilityRecord?: MonthlyUtilityRecord | null
): number {
  if (utilityRecord) return utilityRecordTotal(utilityRecord);
  return num(record.utilities);
}

export function calcMonthlyWithUtilities(
  record: MonthlyFinancialRecord,
  utilityRecord?: MonthlyUtilityRecord | null
): CalculatedMonthly {
  return calcMonthly({ ...record, utilities: resolveUtilitiesAmount(record, utilityRecord) });
}

export function buildUtilitiesLookup(
  records: MonthlyUtilityRecord[]
): Map<string, MonthlyUtilityRecord> {
  const map = new Map<string, MonthlyUtilityRecord>();
  for (const r of records) {
    map.set(monthKey(r.year, r.month), r);
  }
  return map;
}

export function enrichMonthlyRecords(
  records: MonthlyFinancialRecord[],
  utilitiesLookup?: Map<string, MonthlyUtilityRecord>
): CalculatedMonthly[] {
  if (!utilitiesLookup) return records.map(calcMonthly);
  return records.map((r) =>
    calcMonthlyWithUtilities(r, utilitiesLookup.get(monthKey(r.year, r.month)))
  );
}

export function sortRecordsDesc(records: MonthlyFinancialRecord[]): MonthlyFinancialRecord[] {
  return [...records].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });
}

export function sortRecordsAsc(records: CalculatedMonthly[]): CalculatedMonthly[] {
  return [...records].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });
}

export function calcTtmMetrics(records: CalculatedMonthly[]): TtmMetrics {
  const ttm = records.slice(0, 12);
  const ttmRevenue = ttm.reduce((sum, r) => sum + r.revenue, 0);
  const ttmEbitda = ttm.reduce((sum, r) => sum + r.ebitda, 0);
  const ttmDebtService = ttm.reduce((sum, r) => sum + r.debt_service, 0);
  const ttmNoi = ttm.reduce((sum, r) => sum + r.noi, 0);
  const ttmEbitdaMargin = ttmRevenue > 0 ? (ttmEbitda / ttmRevenue) * 100 : 0;
  const dscr = ttmDebtService > 0 ? ttmEbitda / ttmDebtService : 0;

  return {
    ttmRevenue,
    ttmEbitda,
    ttmEbitdaMargin,
    ttmDebtService,
    ttmNoi,
    dscr,
    monthsUsed: ttm.length,
  };
}

import type { createClient } from "@/lib/supabase";
import { toNum, toNullableText } from "@/lib/formHelpers";

type FinancialsSupabaseClient = ReturnType<typeof createClient>;

export async function fetchStoreTtmMetrics(
  supabase: FinancialsSupabaseClient,
  storeId: string
): Promise<TtmMetrics | null> {
  const [{ data: financialsData }, { data: utilitiesData }] = await Promise.all([
    supabase
      .from("monthly_financials")
      .select("*")
      .eq("store_id", storeId)
      .order("year", { ascending: false })
      .order("month", { ascending: false }),
    supabase
      .from("monthly_utilities")
      .select("year, month, water, gas, electric, sewer, trash, internet")
      .eq("store_id", storeId),
  ]);

  if (!financialsData || financialsData.length === 0) return null;

  const utilitiesLookup = buildUtilitiesLookup((utilitiesData ?? []) as MonthlyUtilityRecord[]);
  const records = enrichMonthlyRecords(
    sortRecordsDesc(financialsData as MonthlyFinancialRecord[]),
    utilitiesLookup
  );

  return calcTtmMetrics(records);
}

export function resolveAnnualEbitda(
  ttm: TtmMetrics | null
): { annualEbitda: number; ttmMonthsUsed: number } {
  if (ttm && ttm.monthsUsed > 0) {
    return { annualEbitda: ttm.ttmEbitda, ttmMonthsUsed: ttm.monthsUsed };
  }
  return { annualEbitda: 0, ttmMonthsUsed: 0 };
}

function annualizeExpense(
  records: CalculatedMonthly[],
  field: keyof Pick<
    MonthlyFinancialRecord,
    "rent" | "utilities" | "payroll"
  >
): number {
  const ttm = records.slice(0, 12);
  if (ttm.length >= 12) {
    return ttm.reduce((sum, r) => sum + num(r[field]), 0);
  }
  const recent = records[0];
  if (!recent) return 0;
  return num(recent[field]) * 12;
}

export function calcRatios(
  store: StoreFinancialProfile,
  records: CalculatedMonthly[],
  ttm: TtmMetrics
): FinancialRatios {
  const sqft = num(store.square_footage);
  const washers = num(store.washers);
  const dryers = num(store.dryers);
  const totalMachines = washers + dryers;

  const annualRent = annualizeExpense(records, "rent");
  const annualUtilities = annualizeExpense(records, "utilities");
  const annualPayroll = annualizeExpense(records, "payroll");

  const ttmRevenue = ttm.ttmRevenue;

  return {
    rentPct: ttmRevenue > 0 ? (annualRent / ttmRevenue) * 100 : 0,
    utilityPct: ttmRevenue > 0 ? (annualUtilities / ttmRevenue) * 100 : 0,
    payrollPct: ttmRevenue > 0 ? (annualPayroll / ttmRevenue) * 100 : 0,
    revenuePerSF: sqft > 0 ? ttmRevenue / sqft : 0,
    ebitdaPerSF: sqft > 0 ? ttm.ttmEbitda / sqft : 0,
    totalMachines,
    revenuePerMachine: totalMachines > 0 ? ttmRevenue / totalMachines : 0,
    revenuePerWasher: washers > 0 ? ttmRevenue / washers : 0,
    revenuePerDryer: dryers > 0 ? ttmRevenue / dryers : 0,
    annualRent,
    annualUtilities,
    annualPayroll,
  };
}

export function dscrSubColor(dscr: number): "positive" | "warning" | "negative" {
  if (dscr >= 1.5) return "positive";
  if (dscr >= 1.25) return "warning";
  return "negative";
}

export function dscrTextColor(dscr: number): string {
  if (dscr >= 1.5) return "text-green-400";
  if (dscr >= 1.25) return "text-amber-400";
  return "text-red-400";
}

export function ratioStatusColor(
  pct: number,
  thresholds: { good: number; warn: number },
  lowerIsBetter = true
): string {
  if (lowerIsBetter) {
    if (pct <= thresholds.good) return "text-green-400";
    if (pct <= thresholds.warn) return "text-amber-400";
    return "text-red-400";
  }
  if (pct >= thresholds.good) return "text-green-400";
  if (pct >= thresholds.warn) return "text-amber-400";
  return "text-red-400";
}

export function monthKey(year: number, month: number): string {
  return `${year}-${month}`;
}

export function monthChartLabel(year: number, month: number): string {
  return `${MONTH_SHORT[month - 1]} '${String(year).slice(-2)}`;
}

export function emptyMonthlyForm(
  store?: StoreFinancialProfile | null
): Omit<MonthlyFinancialRecord, "id" | "store_id"> {
  const monthlyDebt = store?.annual_debt_service
    ? Math.round(store.annual_debt_service / 12)
    : 0;

  return {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    revenue: num(store?.monthly_revenue),
    self_service_revenue: 0,
    wdf_revenue: 0,
    commercial_revenue: 0,
    vending_revenue: 0,
    other_revenue: 0,
    utilities: 0,
    rent: num(store?.monthly_rent),
    payroll: 0,
    repairs_maintenance: 0,
    insurance_expense: 0,
    supplies: 0,
    marketing: 0,
    professional_fees: 0,
    software_subscriptions: 0,
    cc_processing_fees: 0,
    bank_charges: 0,
    other_expenses: 0,
    debt_service: monthlyDebt,
    notes: null,
  };
}

export function recordToForm(record: CalculatedMonthly): Omit<MonthlyFinancialRecord, "id" | "store_id"> {
  return {
    year: record.year,
    month: record.month,
    revenue: record.revenue,
    self_service_revenue: num(record.self_service_revenue),
    wdf_revenue: num(record.wdf_revenue),
    commercial_revenue: num(record.commercial_revenue),
    vending_revenue: num(record.vending_revenue),
    other_revenue: num(record.other_revenue),
    utilities: record.utilities,
    rent: record.rent,
    payroll: record.payroll,
    repairs_maintenance: record.repairs_maintenance,
    insurance_expense: record.insurance_expense,
    supplies: record.supplies,
    marketing: record.marketing,
    professional_fees: record.professional_fees,
    software_subscriptions: num(record.software_subscriptions),
    cc_processing_fees: num(record.cc_processing_fees),
    bank_charges: record.bank_charges,
    other_expenses: record.other_expenses,
    debt_service: record.debt_service,
    notes: record.notes ?? null,
  };
}

export type YoYMetrics = {
  revenueGrowth: number | null;
  ebitdaGrowth: number | null;
  marginChange: number | null;
  currentRevenue: number;
  priorRevenue: number;
  currentEbitda: number;
  priorEbitda: number;
  currentMargin: number;
  priorMargin: number;
};

export function calcYoYMetrics(records: CalculatedMonthly[]): YoYMetrics {
  const current = records.slice(0, 12);
  const prior = records.slice(12, 24);

  const currentRevenue = current.reduce((s, r) => s + r.revenue, 0);
  const priorRevenue = prior.reduce((s, r) => s + r.revenue, 0);
  const currentEbitda = current.reduce((s, r) => s + r.ebitda, 0);
  const priorEbitda = prior.reduce((s, r) => s + r.ebitda, 0);
  const currentMargin = currentRevenue > 0 ? (currentEbitda / currentRevenue) * 100 : 0;
  const priorMargin = priorRevenue > 0 ? (priorEbitda / priorRevenue) * 100 : 0;

  return {
    revenueGrowth: priorRevenue > 0 ? ((currentRevenue - priorRevenue) / priorRevenue) * 100 : null,
    ebitdaGrowth: priorEbitda > 0 ? ((currentEbitda - priorEbitda) / priorEbitda) * 100 : null,
    marginChange: prior.length >= 12 ? currentMargin - priorMargin : null,
    currentRevenue,
    priorRevenue,
    currentEbitda,
    priorEbitda,
    currentMargin,
    priorMargin,
  };
}

export function getChartRecords(records: CalculatedMonthly[], count: number): CalculatedMonthly[] {
  return sortRecordsAsc(records).slice(-count);
}

export const PL_CATEGORY_FIELDS = [
  "revenue",
  "utilities",
  "rent",
  "payroll",
  "repairs_maintenance",
  "insurance_expense",
  "supplies",
  "marketing",
  "professional_fees",
  "software_subscriptions",
  "cc_processing_fees",
  "bank_charges",
  "other_expenses",
  "debt_service",
] as const;

export type PlCategoryField = (typeof PL_CATEGORY_FIELDS)[number];

export type TransactionType = "income" | "expense";

/** Granular utility categories for bank import (posted to monthly_utilities, not monthly_financials). */
export const UTILITY_IMPORT_FIELDS = [
  "water",
  "gas",
  "electric",
  "trash",
  "sewer",
  "internet",
] as const;

export type UtilityImportField = (typeof UTILITY_IMPORT_FIELDS)[number];

/** Granular revenue breakdown columns in monthly_financials (bank import income categories). */
export const REVENUE_BREAKDOWN_FIELDS = [
  "self_service_revenue",
  "wdf_revenue",
  "commercial_revenue",
  "vending_revenue",
  "other_revenue",
] as const;

export type RevenueBreakdownField = (typeof REVENUE_BREAKDOWN_FIELDS)[number];

/** Categories shown in bank import review (extends P&L fields with import-only options). */
export type BankImportCategory =
  | Exclude<PlCategoryField, "utilities" | "revenue">
  | RevenueBreakdownField
  | UtilityImportField
  | "bank_fees"
  | "needs_review"
  | "utilities"
  | "revenue"
  | "other_income";

export const UTILITY_IMPORT_CATEGORIES: UtilityImportField[] = [
  "water",
  "gas",
  "electric",
  "trash",
  "sewer",
  "internet",
];

export const INCOME_IMPORT_CATEGORIES: BankImportCategory[] = [
  "self_service_revenue",
  "wdf_revenue",
  "commercial_revenue",
  "vending_revenue",
  "other_revenue",
  "needs_review",
];

export const EXPENSE_IMPORT_CATEGORIES: BankImportCategory[] = [
  ...UTILITY_IMPORT_CATEGORIES,
  "rent",
  "payroll",
  "repairs_maintenance",
  "insurance_expense",
  "supplies",
  "marketing",
  "professional_fees",
  "software_subscriptions",
  "debt_service",
  "cc_processing_fees",
  "bank_fees",
  "other_expenses",
  "needs_review",
];

export const BANK_IMPORT_CATEGORY_LABELS: Record<BankImportCategory, string> = {
  self_service_revenue: "Self-Service / Coin Revenue",
  wdf_revenue: "Wash Dry Fold Revenue",
  commercial_revenue: "Commercial Laundry Revenue",
  vending_revenue: "Vending Revenue",
  other_revenue: "Other Revenue",
  revenue: "Revenue (legacy)",
  other_income: "Other Income (legacy)",
  water: "Water",
  gas: "Gas",
  electric: "Electric",
  trash: "Trash",
  sewer: "Sewer",
  internet: "Internet",
  utilities: "Utilities (legacy)",
  rent: "Rent",
  payroll: "Payroll",
  repairs_maintenance: "Repairs & Maintenance",
  insurance_expense: "Insurance",
  supplies: "Supplies",
  marketing: "Advertising / Marketing",
  professional_fees: "Professional Fees",
  software_subscriptions: "Software & Subscriptions",
  cc_processing_fees: "Credit Card Processing Fees",
  bank_charges: "Bank Charges",
  debt_service: "Debt Service",
  bank_fees: "Bank Fees",
  other_expenses: "Other Expenses",
  needs_review: "Needs Review",
};

export type RuleType = "vendor" | "amount";

export type RuleMatchKind = false | "amount" | "vendor";

export type CategorizationRule = {
  id: string;
  user_id: string;
  vendor_pattern: string;
  category: string;
  rule_type?: RuleType | null;
  amount?: number | null;
  amount_tolerance?: number | null;
  transaction_type?: TransactionType | null;
  created_at?: string;
};

export const CATEGORY_KEYWORDS: Record<PlCategoryField, string[]> = {
  revenue: [
    "deposit",
    "cash deposit",
    "mobile deposit",
    "sales",
    "income",
  ],
  utilities: [],
  rent: ["rent", "lease payment", "landlord", "property management", "lease", "cam"],
  payroll: ["payroll", "adp", "gusto", "paychex", "employee pay", "wages", "salary", "employee"],
  repairs_maintenance: [
    "repair",
    "maintenance",
    "hvac",
    "plumb",
    "electrician",
    "parts",
    "speed queen",
    "alliance laundry",
    "continental girbau",
    "wascomat",
    "huebsch",
    "dexter",
    "service call",
    "wss",
    "western state design",
    "mat classic",
    "unitex",
    "ecolab",
  ],
  insurance_expense: [
    "insurance",
    "foremost",
    "geico",
    "progressive",
    "state farm",
    "liberty mutual",
    "travelers",
    "hartford",
    "premium",
    "liability",
    "policy",
  ],
  supplies: [
    "supplies",
    "detergent",
    "soap",
    "sams club",
    "costco",
    "office depot",
    "staples",
    "supply",
    "chemical",
    "vending",
    "unitex",
  ],
  marketing: ["marketing", "advertising", "facebook ads", "google ads", "yelp", "flyers", "advert", "facebook", "promo"],
  professional_fees: ["accountant", "cpa", "legal", "attorney", "bookkeeping", "consult"],
  software_subscriptions: [
    "adobe",
    "microsoft",
    "google workspace",
    "quickbooks subscription",
    "zoom",
    "dropbox",
    "canva",
    "shopify",
    "mailchimp",
    "slack",
    "notion",
    "subscription",
    "saas",
  ],
  cc_processing_fees: [
    "merchant fee",
    "processing fee",
    "interchange fee",
    "square fee",
    "clover fee",
    "card processing",
    "discount fee",
    "cardconnect fee",
    "tsys fee",
  ],
  bank_charges: ["bank fee", "bank charge", "service charge", "overdraft", "nsf", "wire fee", "monthly fee"],
  other_expenses: ["misc", "other", "office"],
  debt_service: [
    "loan payment",
    "eastern funding",
    "sba loan",
    "principal",
    "note payment",
    "loan",
    "mortgage",
    "debt",
    "sba",
    "interest",
  ],
};

export const SELF_SERVICE_REVENUE_KEYWORDS = [
  "deposit",
  "cash deposit",
  "mobile deposit",
  "cknet deposit",
  "merchant deposit",
  "merchant bankcd",
  "card payment received",
  "merchant services",
  "cardpayment",
  "coin",
  "card",
  "fascard",
  "laundrynet",
  "laundryworks",
  "laundroworks",
  "cardconnect",
  "square inc",
  "square",
  "sq2",
  "clover",
  "worldpay",
  "tsys",
  "cents",
  "spyn",
  "ach credit",
  "remote deposit",
  "revenue",
];

export const WDF_REVENUE_KEYWORDS = ["wdf", "wash dry fold"];

export const VENDING_REVENUE_KEYWORDS = ["vending", "vend"];

const OTHER_REVENUE_KEYWORDS = ["interest earned", "refund", "rebate", "insurance proceeds", "grant"];

const BANK_FEE_KEYWORDS = [
  "service charge",
  "service fee",
  "monthly fee",
  "maintenance fee",
  "overdraft",
  "od fee",
  "nsf",
  "wire fee",
  "atm fee",
  "bank fee",
  "analysis fee",
  "returned item",
];

const NEEDS_REVIEW_KEYWORDS = [
  "transfer",
  "zelle",
  "venmo",
  "paypal transfer",
  "ach transfer",
  "wire transfer",
  "internal transfer",
  "atm withdraw",
  "atm withdrawal",
  "cash withdraw",
  "cash withdrawal",
  "worldnet tps",
];

const EXPENSE_CATEGORY_ORDER: PlCategoryField[] = [
  "rent",
  "payroll",
  "repairs_maintenance",
  "insurance_expense",
  "supplies",
  "marketing",
  "professional_fees",
  "software_subscriptions",
  "cc_processing_fees",
  "debt_service",
];

export const UTILITY_CATEGORY_KEYWORDS: Record<UtilityImportField, string[]> = {
  water: [
    "water",
    "h2o",
    "aqua",
    "city water",
    "water dept",
    "water department",
    "water utility",
    "municipal water",
    "public works water",
    "culligan",
    "water softener",
  ],
  gas: ["gas company", "natural gas", "propane", "national grid gas", "nicor", "spire", "atmos energy", "peoples gas"],
  electric: [
    "electric",
    "electricity",
    "power",
    "pg&e",
    "pge",
    "eversource",
    "green mountain power",
    "gmp",
    "edison",
    "duke energy",
    "dominion energy",
  ],
  trash: ["trash", "waste management", "republic services", "rubbish", "dumpster", "recycling", "waste disposal"],
  sewer: ["sewer", "wastewater", "sewage"],
  internet: ["internet", "comcast", "xfinity", "spectrum", "fios", "broadband", "wifi", "frontier", "centurylink"],
};

export function isRevenueBreakdownCategory(category: BankImportCategory): category is RevenueBreakdownField {
  return (REVENUE_BREAKDOWN_FIELDS as readonly string[]).includes(category);
}

export function isUtilityImportCategory(category: BankImportCategory): category is UtilityImportField {
  return (UTILITY_IMPORT_FIELDS as readonly string[]).includes(category);
}

export function mapBankCategoryToUtilityField(category: BankImportCategory): UtilityImportField | null {
  if (isUtilityImportCategory(category)) return category;
  return null;
}

export function mapBankCategoryToRevenueField(category: BankImportCategory): RevenueBreakdownField | null {
  if (isRevenueBreakdownCategory(category)) return category;
  if (category === "revenue") return "self_service_revenue";
  if (category === "other_income") return "other_revenue";
  return null;
}

export function sumRevenueBreakdown(
  record: Partial<Pick<MonthlyFinancialRecord, RevenueBreakdownField>>
): number {
  return REVENUE_BREAKDOWN_FIELDS.reduce((sum, field) => sum + num(record[field]), 0);
}

export function isCategoryReadyToPost(category: BankImportCategory): boolean {
  return category !== "needs_review" && category !== "utilities";
}

export function mapBankCategoryToPlField(category: BankImportCategory): PlCategoryField | null {
  if (
    category === "needs_review" ||
    category === "utilities" ||
    isUtilityImportCategory(category) ||
    isRevenueBreakdownCategory(category) ||
    category === "revenue" ||
    category === "other_income"
  ) {
    return null;
  }
  if (category === "bank_fees") return "bank_charges";
  return category;
}

function suggestUtilityCategory(text: string): BankImportCategory | null {
  if (text.includes("national grid gas")) return "gas";
  if (text.includes("national grid electric") || text.includes("national grid elec")) return "electric";
  if (/\bnational\s+grid\b/.test(text)) return "needs_review";

  const matches: UtilityImportField[] = [];
  for (const field of UTILITY_IMPORT_FIELDS) {
    for (const keyword of UTILITY_CATEGORY_KEYWORDS[field]) {
      if (text.includes(keyword.toLowerCase())) {
        if (!matches.includes(field)) matches.push(field);
        break;
      }
    }
  }

  if (matches.length > 1) return "needs_review";
  if (matches.length === 1) return matches[0];

  if (/\b(utilities?|energy\s+bill)\b/.test(text)) return "needs_review";

  return null;
}

export function getImportCategoriesForType(type: TransactionType): BankImportCategory[] {
  return type === "income" ? INCOME_IMPORT_CATEGORIES : EXPENSE_IMPORT_CATEGORIES;
}

export function suggestTransactionCategory(
  description: string | null,
  type?: TransactionType
): BankImportCategory {
  const text = (description ?? "").toLowerCase();
  const trimmed = (description ?? "").trim();

  if (!trimmed || /^check\s*#?\d*$/i.test(trimmed) || trimmed.toLowerCase() === "check") {
    return "needs_review";
  }

  for (const keyword of NEEDS_REVIEW_KEYWORDS) {
    if (text.includes(keyword)) return "needs_review";
  }

  if (type === "income") {
    for (const keyword of WDF_REVENUE_KEYWORDS) {
      if (text.includes(keyword)) return "wdf_revenue";
    }
    for (const keyword of VENDING_REVENUE_KEYWORDS) {
      if (text.includes(keyword)) return "vending_revenue";
    }
    for (const keyword of OTHER_REVENUE_KEYWORDS) {
      if (text.includes(keyword)) return "other_revenue";
    }
    for (const keyword of SELF_SERVICE_REVENUE_KEYWORDS) {
      if (text.includes(keyword.toLowerCase())) return "self_service_revenue";
    }
    return "self_service_revenue";
  }

  const utilityCategory = suggestUtilityCategory(text);
  if (utilityCategory) return utilityCategory;

  for (const field of EXPENSE_CATEGORY_ORDER) {
    for (const keyword of CATEGORY_KEYWORDS[field]) {
      if (text.includes(keyword.toLowerCase())) return field;
    }
  }

  for (const keyword of BANK_FEE_KEYWORDS) {
    if (text.includes(keyword)) return "bank_fees";
  }

  return "needs_review";
}

const GENERIC_DESCRIPTION_PATTERNS = [
  /^CHECK\s*#?\d*$/,
  /^BILL\s*PAY\s*-?\s*CHECK\s*#?\d*$/,
  /^BILLPAY$/,
  /^ATM\s+WITHDRAWAL$/,
  /^ATM\s+WITHDRAW$/,
  /^TRANSFER$/,
];

export function isGenericTransactionDescription(description: string | null): boolean {
  const candidates = [
    normalizeVendorPattern(description),
    (description ?? "").trim().toUpperCase().replace(/\s+/g, " "),
  ].filter(Boolean);

  return candidates.some((text) =>
    GENERIC_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(text))
  );
}

export function findMatchingAmountRule(
  rules: CategorizationRule[],
  amount: number,
  type: TransactionType
): CategorizationRule | null {
  const absAmount = Math.abs(amount);

  for (const rule of rules) {
    if (rule.rule_type !== "amount") continue;
    if (rule.transaction_type && rule.transaction_type !== type) continue;
    if (rule.amount == null) continue;

    const tolerance = rule.amount_tolerance ?? 0.01;
    if (Math.abs(absAmount - Math.abs(rule.amount)) <= tolerance) return rule;
  }

  return null;
}

export function findMatchingVendorRule(
  rules: CategorizationRule[],
  description: string | null
): CategorizationRule | null {
  const normalized = normalizeVendorPattern(description);
  if (!normalized) return null;

  for (const rule of rules) {
    if (rule.rule_type === "amount") continue;
    const pattern = rule.vendor_pattern.trim().toUpperCase();
    if (pattern && normalized.includes(pattern)) return rule;
  }
  return null;
}

/** @deprecated Use findMatchingVendorRule */
export function findMatchingRule(
  rules: CategorizationRule[],
  description: string | null
): CategorizationRule | null {
  return findMatchingVendorRule(rules, description);
}

export function categorizeWithRules(
  description: string | null,
  type: TransactionType,
  amount: number,
  rules: CategorizationRule[]
): { category: BankImportCategory; suggested: BankImportCategory; ruleApplied: RuleMatchKind } {
  const amountRule = findMatchingAmountRule(rules, amount, type);
  if (amountRule) {
    const category = amountRule.category as BankImportCategory;
    return { category, suggested: category, ruleApplied: "amount" };
  }

  const vendorRule = findMatchingVendorRule(rules, description);
  if (vendorRule) {
    const category = vendorRule.category as BankImportCategory;
    return { category, suggested: category, ruleApplied: "vendor" };
  }

  const suggested = suggestTransactionCategory(description, type);
  return { category: suggested, suggested, ruleApplied: false };
}

export type RuleApplyPlan = {
  matchCount: number;
  applicable: BankTransaction[];
  skippedManual: BankTransaction[];
};

export function isUnpostedReviewTransaction(
  txn: Pick<BankTransaction, "status" | "excluded">
): boolean {
  if (txn.excluded) return false;
  const status = txn.status ?? "needs_review";
  return status !== "posted" && status !== "excluded";
}

export function transactionMatchesRule(
  txn: BankTransaction,
  rule: CategorizationRule
): boolean {
  const type =
    (txn.transaction_type as TransactionType | null) ??
    inferTransactionType(txn.amount, txn.category);
  const amount = Math.abs(txn.amount);
  const { ruleApplied } = categorizeWithRules(txn.description, type, amount, [rule]);
  return !!ruleApplied;
}

export function planRuleApplyToExisting(
  transactions: BankTransaction[],
  rule: CategorizationRule
): RuleApplyPlan {
  const applicable: BankTransaction[] = [];
  const skippedManual: BankTransaction[] = [];
  let matchCount = 0;

  for (const txn of transactions) {
    if (!isUnpostedReviewTransaction(txn)) continue;
    if (!transactionMatchesRule(txn, rule)) continue;

    matchCount += 1;
    const status = txn.status ?? "needs_review";

    if (status === "user_classified" && txn.category !== rule.category) {
      skippedManual.push(txn);
      continue;
    }

    if (status === "needs_review" || status === "system_classified") {
      applicable.push(txn);
    }
  }

  return { matchCount, applicable, skippedManual };
}

export async function fetchUnpostedBankTransactions(
  supabase: FinancialsSupabaseClient,
  storeId: string
): Promise<{ transactions: BankTransaction[]; error: string | null }> {
  const { data, error } = await supabase
    .from("bank_transactions")
    .select("*")
    .eq("store_id", storeId)
    .eq("excluded", false)
    .not("status", "in", '("posted","excluded")');

  if (error) {
    return { transactions: [], error: error.message };
  }

  return { transactions: (data ?? []) as BankTransaction[], error: null };
}

export type ApplyCategorizationRuleResult = {
  updatedCount: number;
  skippedManualCount: number;
  updatedTransactions: BankTransaction[];
  error: string | null;
};

export async function applyCategorizationRuleToTransactions(
  supabase: FinancialsSupabaseClient,
  params: {
    storeId: string;
    userId: string;
    rule: CategorizationRule;
    transactions: BankTransaction[];
  }
): Promise<ApplyCategorizationRuleResult> {
  const { applicable, skippedManual } = planRuleApplyToExisting(params.transactions, params.rule);

  if (applicable.length === 0) {
    return {
      updatedCount: 0,
      skippedManualCount: skippedManual.length,
      updatedTransactions: [],
      error: null,
    };
  }

  const category = params.rule.category;
  const now = new Date().toISOString();
  const updatedTransactions: BankTransaction[] = [];

  for (const txn of applicable) {
    const { error: updateError } = await supabase
      .from("bank_transactions")
      .update({
        category,
        status: "user_classified",
        modified_at: now,
      })
      .eq("id", txn.id);

    if (updateError) {
      return {
        updatedCount: 0,
        skippedManualCount: skippedManual.length,
        updatedTransactions: [],
        error: updateError.message,
      };
    }

    if (txn.category !== category) {
      const { error: auditError } = await writeTransactionAuditLog(supabase, {
        transactionId: txn.id,
        storeId: params.storeId,
        userId: params.userId,
        fieldChanged: "category",
        oldValue: txn.category,
        newValue: category,
        changeSource: "rule",
      });

      if (auditError) {
        return {
          updatedCount: 0,
          skippedManualCount: skippedManual.length,
          updatedTransactions: [],
          error: auditError,
        };
      }
    }

    updatedTransactions.push({
      ...txn,
      category,
      status: "user_classified",
      modified_at: now,
    });
  }

  return {
    updatedCount: applicable.length,
    skippedManualCount: skippedManual.length,
    updatedTransactions,
    error: null,
  };
}

export function inferTransactionType(
  amount: number,
  category?: string | null
): TransactionType {
  if (
    category &&
    ((REVENUE_BREAKDOWN_FIELDS as readonly string[]).includes(category) ||
      category === "revenue" ||
      category === "other_income")
  ) {
    return "income";
  }
  if (amount < 0) return "expense";
  if (amount > 0) return "income";
  return "expense";
}

export function normalizeVendorPattern(description: string | null): string {
  if (!description?.trim()) return "";
  let s = description.trim();
  const starIdx = s.indexOf("*");
  if (starIdx > 0) s = s.slice(0, starIdx).trim() || s.slice(starIdx + 1).trim();
  s = s.replace(/\s+/g, " ");
  s = s.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, " ");
  s = s.replace(/\b\d{8,}\b/g, " ");
  s = s.replace(/\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*[0-9])[A-Z0-9]{8,}\b/gi, " ");
  s = s.replace(/^(EPM PYMT|PAYMENT|DEPOSIT|SQ\d+|CKNET|ACH CREDIT|ACH DEBIT)\s+/i, "");
  s = s.replace(/\b(PPD|CCD|WEB|ACH|CHK|TEL|PPD|SEC)\b/gi, " ");
  s = s.replace(/\s+-\s+[A-Z0-9\s]+$/i, "");
  s = s.replace(/\s+[A-Z]{2,}\s+[A-Z]{2,}$/i, (match) => {
    const parts = match.trim().split(/\s+/);
    if (parts.length === 2 && parts.every((p) => /^[A-Z]+$/.test(p))) return "";
    return match;
  });
  s = s
    .replace(/\s+#?\d{4,}\s*/g, " ")
    .replace(/\s+\d+\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.toUpperCase();
}

export function normalizeDescriptionForGrouping(description: string | null): string {
  const pattern = normalizeVendorPattern(description);
  return pattern || "(no description)";
}

function parseCsvAmount(raw: string): number {
  const cleaned = raw.replace(/[$,()]/g, "").trim();
  if (!cleaned) return 0;
  const parenNegative = /^\(.*\)$/.test(raw.trim());
  const n = parseFloat(cleaned);
  if (Number.isNaN(n)) return 0;
  return parenNegative ? -Math.abs(n) : n;
}

function parseCsvTypeIndicator(raw: string): TransactionType | null {
  const t = raw.trim().toLowerCase();
  if (["debit", "dr", "withdrawal", "expense", "check"].includes(t)) return "expense";
  if (["credit", "cr", "deposit", "income"].includes(t)) return "income";
  return null;
}

function normalizeCsvHeader(raw: string): string {
  return raw.trim().replace(/^"|"$/g, "").toLowerCase();
}

function findCsvDateColumn(headers: string[]): number {
  const priority = ["processed date", "posting date", "transaction date", "date"];
  for (const name of priority) {
    const idx = headers.indexOf(name);
    if (idx >= 0) return idx;
  }
  return headers.findIndex((h) => h.includes("date") && !h.includes("account"));
}

function findCsvDescriptionColumn(headers: string[]): number {
  const priority = ["description", "transaction description", "memo", "payee"];
  for (const name of priority) {
    const idx = headers.indexOf(name);
    if (idx >= 0) return idx;
  }
  return headers.findIndex(
    (h) =>
      (h.includes("description") || h === "memo" || h === "payee") &&
      !h.includes("account") &&
      h !== "account name"
  );
}

function findCsvTypeColumn(headers: string[]): number {
  const priority = [
    "credit or debit",
    "type",
    "transaction type",
    "dr/cr",
    "debit/credit",
    "dc",
    "tran type",
  ];
  for (const name of priority) {
    const idx = headers.indexOf(name);
    if (idx >= 0) return idx;
  }
  return headers.findIndex((h) =>
    /credit or debit|transaction type|^type$|debit\/credit|dr\/cr/.test(h)
  );
}

function findCsvAmountColumn(headers: string[]): number {
  const priority = ["amount", "transaction amount", "trans amount", "value"];
  for (const name of priority) {
    const idx = headers.indexOf(name);
    if (idx >= 0) return idx;
  }
  return headers.findIndex((h) => /^amount$|transaction amount|trans amount/.test(h));
}

function findCsvDebitCreditColumns(headers: string[]): { debitIdx: number; creditIdx: number } {
  const debitIdx = headers.findIndex(
    (h) => /^(debit|withdrawal|dr|debits)$/.test(h) || h === "debit amount" || h === "withdrawals"
  );
  const creditIdx = headers.findIndex(
    (h) => /^(credit|deposit|cr|credits)$/.test(h) || h === "credit amount" || h === "deposits"
  );
  return { debitIdx, creditIdx };
}

function parseCsvDate(raw: string): string {
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString().slice(0, 10)
    : parsed.toISOString().slice(0, 10);
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      fields.push(field.trim().replace(/^"|"$/g, ""));
      field = "";
      continue;
    }
    field += ch;
  }

  fields.push(field.trim().replace(/^"|"$/g, ""));
  return fields;
}

export type ParsedCsvTransaction = {
  date: string;
  description: string | null;
  amount: number;
  type: TransactionType;
};

export type CsvParseFormat = {
  headers: string[];
  dateIdx: number;
  descIdx: number;
  debitIdx: number;
  creditIdx: number;
  amountIdx: number;
  typeIdx: number;
  hasDebitCredit: boolean;
  format: "debit_credit" | "amount_with_type" | "signed_amount";
};

function detectCsvFormat(headers: string[]): CsvParseFormat | null {
  const { debitIdx, creditIdx } = findCsvDebitCreditColumns(headers);
  const dateIdx = findCsvDateColumn(headers);
  const descIdx = findCsvDescriptionColumn(headers);
  const amountIdx = findCsvAmountColumn(headers);
  const typeIdx = findCsvTypeColumn(headers);
  const hasDebitCredit = debitIdx >= 0 && creditIdx >= 0;

  if (dateIdx === -1) return null;
  if (!hasDebitCredit && amountIdx === -1) return null;

  let format: CsvParseFormat["format"];
  if (hasDebitCredit) format = "debit_credit";
  else if (amountIdx >= 0 && typeIdx >= 0) format = "amount_with_type";
  else format = "signed_amount";

  return { headers, dateIdx, descIdx, debitIdx, creditIdx, amountIdx, typeIdx, hasDebitCredit, format };
}

export type DuplicateCheckTransaction = {
  transaction_date: string;
  amount: number;
  type: TransactionType;
};

export function transactionDuplicateKey(txn: DuplicateCheckTransaction): string {
  const date = txn.transaction_date.split("T")[0];
  const amount = Math.abs(txn.amount).toFixed(2);
  return `${date}|${amount}|${txn.type}`;
}

export function isDuplicateTransaction(
  txn: DuplicateCheckTransaction,
  existing: DuplicateCheckTransaction[]
): boolean {
  const key = transactionDuplicateKey(txn);
  return existing.some((e) => transactionDuplicateKey(e) === key);
}

export function markDuplicateTransactions<T extends DuplicateCheckTransaction>(
  transactions: T[],
  existing: DuplicateCheckTransaction[]
): (T & { possibleDuplicate: boolean })[] {
  const seen = new Set(existing.map(transactionDuplicateKey));
  return transactions.map((txn) => {
    const key = transactionDuplicateKey(txn);
    const possibleDuplicate = seen.has(key);
    seen.add(key);
    return { ...txn, possibleDuplicate };
  });
}

export function parseBankCsv(text: string): ParsedCsvTransaction[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map(normalizeCsvHeader);
  const fmt = detectCsvFormat(headers);

  if (!fmt) {
    console.warn("[Bank CSV] Unrecognized format. Headers:", headers);
    return [];
  }

  const rawRows = lines.slice(1, 6).map((line) => {
    const cols = splitCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? ""]));
  });

  console.log("[Bank CSV] Detected format:", fmt.format, {
    headers: fmt.headers,
    dateIdx: fmt.dateIdx,
    descIdx: fmt.descIdx,
    amountIdx: fmt.amountIdx,
    typeIdx: fmt.typeIdx,
    hasDebitCredit: fmt.hasDebitCredit,
  });
  console.log("[Bank CSV] First 5 raw rows:", rawRows);

  const results: ParsedCsvTransaction[] = [];

  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const rawDate = cols[fmt.dateIdx] ?? "";
    const description = fmt.descIdx >= 0 ? cols[fmt.descIdx]?.trim() || null : null;
    const date = parseCsvDate(rawDate);

    let amount = 0;
    let type: TransactionType = "expense";

    if (fmt.format === "amount_with_type") {
      const rawAmount = cols[fmt.amountIdx] ?? "0";
      amount = Math.abs(parseCsvAmount(rawAmount));
      const typeHint = parseCsvTypeIndicator(cols[fmt.typeIdx] ?? "");
      if (!typeHint || amount === 0) continue;
      type = typeHint;
    } else if (fmt.hasDebitCredit) {
      const debitRaw = cols[fmt.debitIdx] ?? "";
      const creditRaw = cols[fmt.creditIdx] ?? "";
      const debitVal = parseCsvAmount(debitRaw);
      const creditVal = parseCsvAmount(creditRaw);

      if (Math.abs(debitVal) > 0 && Math.abs(creditVal) === 0) {
        amount = Math.abs(debitVal);
        type = "expense";
      } else if (Math.abs(creditVal) > 0 && Math.abs(debitVal) === 0) {
        amount = Math.abs(creditVal);
        type = "income";
      } else if (Math.abs(creditVal) > 0) {
        amount = Math.abs(creditVal);
        type = "income";
      } else if (Math.abs(debitVal) > 0) {
        amount = Math.abs(debitVal);
        type = "expense";
      } else {
        continue;
      }
    } else {
      const rawAmount = parseCsvAmount(cols[fmt.amountIdx] ?? "0");
      if (rawAmount === 0) continue;
      if (rawAmount < 0) {
        type = "expense";
        amount = Math.abs(rawAmount);
      } else {
        type = "income";
        amount = rawAmount;
      }
    }

    if (amount === 0) continue;

    results.push({ date, description, amount, type });
  }

  console.log("[Bank CSV] Total rows parsed:", results.length, "of", lines.length - 1, "data rows");

  if (results.length > 0) {
    console.log("[Bank CSV] First 5 normalized transactions:", results.slice(0, 5));
  }

  return results;
}

export type RatioBenchmark = {
  label: string;
  value: number;
  unit: "%" | "$" | "x";
  benchmark: number;
  top25: number;
  bottom25: number;
  lowerIsBetter: boolean;
  progressMax?: number;
};

export function buildRatioBenchmarks(
  ttm: TtmMetrics,
  ratios: FinancialRatios
): RatioBenchmark[] {
  return [
    {
      label: "DSCR",
      value: ttm.dscr,
      unit: "x",
      benchmark: 1.5,
      top25: 2.0,
      bottom25: 1.1,
      lowerIsBetter: false,
      progressMax: 3,
    },
    {
      label: "Rent / Revenue",
      value: ratios.rentPct,
      unit: "%",
      benchmark: 15,
      top25: 10,
      bottom25: 20,
      lowerIsBetter: true,
      progressMax: 25,
    },
    {
      label: "Utility Ratio",
      value: ratios.utilityPct,
      unit: "%",
      benchmark: 18,
      top25: 14,
      bottom25: 24,
      lowerIsBetter: true,
      progressMax: 30,
    },
    {
      label: "Payroll / Revenue",
      value: ratios.payrollPct,
      unit: "%",
      benchmark: 15,
      top25: 12,
      bottom25: 22,
      lowerIsBetter: true,
      progressMax: 30,
    },
    {
      label: "Revenue / SF",
      value: ratios.revenuePerSF,
      unit: "$",
      benchmark: 140,
      top25: 180,
      bottom25: 90,
      lowerIsBetter: false,
      progressMax: 220,
    },
    {
      label: "EBITDA / SF",
      value: ratios.ebitdaPerSF,
      unit: "$",
      benchmark: 35,
      top25: 50,
      bottom25: 20,
      lowerIsBetter: false,
      progressMax: 70,
    },
    {
      label: "Revenue / Machine",
      value: ratios.revenuePerMachine,
      unit: "$",
      benchmark: 11000,
      top25: 14000,
      bottom25: 7000,
      lowerIsBetter: false,
      progressMax: 18000,
    },
    {
      label: "Revenue / Washer",
      value: ratios.revenuePerWasher,
      unit: "$",
      benchmark: 12000,
      top25: 15000,
      bottom25: 8000,
      lowerIsBetter: false,
      progressMax: 20000,
    },
    {
      label: "Revenue / Dryer",
      value: ratios.revenuePerDryer,
      unit: "$",
      benchmark: 10000,
      top25: 13000,
      bottom25: 6000,
      lowerIsBetter: false,
      progressMax: 18000,
    },
  ];
}

export function calcOccupancyCost(ratios: FinancialRatios, ttm: TtmMetrics): {
  annualOccupancy: number;
  occupancyPct: number;
  rentPct: number;
  insurancePct: number;
} {
  const annualOccupancy = ratios.annualRent;
  const insuranceAnnual =
    ttm.monthsUsed >= 12
      ? 0
      : 0;
  void insuranceAnnual;
  const occupancyPct = ttm.ttmRevenue > 0 ? (annualOccupancy / ttm.ttmRevenue) * 100 : 0;
  return {
    annualOccupancy,
    occupancyPct,
    rentPct: ratios.rentPct,
    insurancePct: 0,
  };
}

export type PostingTargetTable = "monthly_utilities" | "monthly_financials";

export type PostingTarget = {
  table: PostingTargetTable;
  column: string;
};

export type BatchPostTransaction = {
  id: string;
  transaction_date: string;
  amount: number;
  category: BankImportCategory;
  status?: TransactionStatus | null;
  original_category?: string | null;
};

export type PostTransactionsBatchParams = {
  storeId: string;
  userId: string;
  transactions: BatchPostTransaction[];
  existingRecords?: MonthlyFinancialRecord[];
  existingUtilityRecords?: MonthlyUtilityRecord[];
  store?: StoreFinancialProfile | null;
  changeSource?: TransactionChangeSource;
};

export type PostTransactionsBatchResult = {
  postedCount: number;
  error: string | null;
};

function normalizeTransactionAmount(amount: number): number {
  return Math.abs(amount);
}

function emptyUtilityDelta(): Record<UtilityImportField, number> {
  return { water: 0, gas: 0, electric: 0, sewer: 0, trash: 0, internet: 0 };
}

function parseMonthPeriodKey(key: string): { year: number; month: number } {
  const [year, month] = key.split("-").map(Number);
  return { year, month };
}

export function resolvePostingTarget(
  importCategory: BankImportCategory
): PostingTarget | null {
  const revenueField = mapBankCategoryToRevenueField(importCategory);
  if (revenueField) {
    return { table: "monthly_financials", column: revenueField };
  }

  const utilityField = mapBankCategoryToUtilityField(importCategory);
  if (utilityField) {
    return { table: "monthly_utilities", column: utilityField };
  }

  const plField = mapBankCategoryToPlField(importCategory);
  if (plField) {
    return { table: "monthly_financials", column: plField };
  }

  return null;
}

function isRevenueBreakdownColumn(column: string): column is RevenueBreakdownField {
  return (REVENUE_BREAKDOWN_FIELDS as readonly string[]).includes(column);
}

function isUtilityColumn(column: string): column is UtilityImportField {
  return (UTILITY_IMPORT_FIELDS as readonly string[]).includes(column);
}

function isPlCategoryColumn(column: string): column is PlCategoryField {
  return (PL_CATEGORY_FIELDS as readonly string[]).includes(column);
}

function postingTargetFromStoredCategory(category: string): PostingTarget {
  if (isUtilityColumn(category)) {
    return { table: "monthly_utilities", column: category };
  }
  return { table: "monthly_financials", column: category };
}

async function writeTransactionAuditLog(
  supabase: FinancialsSupabaseClient,
  entry: {
    transactionId: string;
    storeId: string;
    userId: string;
    fieldChanged: string;
    oldValue: string | null;
    newValue: string | null;
    changeSource: TransactionChangeSource;
  }
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("transaction_audit_log").insert({
    transaction_id: entry.transactionId,
    store_id: entry.storeId,
    user_id: entry.userId,
    field_changed: entry.fieldChanged,
    old_value: entry.oldValue,
    new_value: entry.newValue,
    change_source: entry.changeSource,
  });

  return { error: error?.message ?? null };
}

async function fetchMonthlyFinancialRow(
  supabase: FinancialsSupabaseClient,
  storeId: string,
  year: number,
  month: number
): Promise<MonthlyFinancialRecord | null> {
  const { data, error } = await supabase
    .from("monthly_financials")
    .select("*")
    .eq("store_id", storeId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as MonthlyFinancialRecord | null) ?? null;
}

async function fetchMonthlyUtilityRow(
  supabase: FinancialsSupabaseClient,
  storeId: string,
  year: number,
  month: number
): Promise<(MonthlyUtilityRecord & { notes?: string | null }) | null> {
  const { data, error } = await supabase
    .from("monthly_utilities")
    .select("*")
    .eq("store_id", storeId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as (MonthlyUtilityRecord & { notes?: string | null }) | null) ?? null;
}

async function applyPostingDelta(
  supabase: FinancialsSupabaseClient,
  params: {
    storeId: string;
    userId: string;
    year: number;
    month: number;
    target: PostingTarget;
    amount: number;
    reverse?: boolean;
    store?: StoreFinancialProfile | null;
    existingFinancial?: MonthlyFinancialRecord | null;
    existingUtility?: (MonthlyUtilityRecord & { notes?: string | null }) | null;
  }
): Promise<{ error: string | null }> {
  const delta = params.reverse ? -params.amount : params.amount;

  if (params.target.table === "monthly_utilities") {
    if (!isUtilityColumn(params.target.column)) {
      return { error: `Invalid utility category: ${params.target.column}` };
    }

    const existing =
      params.existingUtility ??
      (await fetchMonthlyUtilityRow(supabase, params.storeId, params.year, params.month));

    const payload = {
      store_id: params.storeId,
      user_id: params.userId,
      year: toNum(params.year),
      month: toNum(params.month),
      water: toNum((existing?.water ?? 0) + (params.target.column === "water" ? delta : 0)),
      gas: toNum((existing?.gas ?? 0) + (params.target.column === "gas" ? delta : 0)),
      electric: toNum((existing?.electric ?? 0) + (params.target.column === "electric" ? delta : 0)),
      sewer: toNum((existing?.sewer ?? 0) + (params.target.column === "sewer" ? delta : 0)),
      trash: toNum((existing?.trash ?? 0) + (params.target.column === "trash" ? delta : 0)),
      internet: toNum((existing?.internet ?? 0) + (params.target.column === "internet" ? delta : 0)),
      notes: existing?.notes ?? null,
    };

    const { error } = await supabase
      .from("monthly_utilities")
      .upsert(payload, { onConflict: "store_id,year,month" });

    return { error: error?.message ?? null };
  }

  const existing =
    params.existingFinancial ??
    (await fetchMonthlyFinancialRow(supabase, params.storeId, params.year, params.month));

  const base = existing
    ? recordToForm(calcMonthly(existing))
    : { ...emptyMonthlyForm(params.store), year: params.year, month: params.month };

  let updated = { ...base };

  if (isRevenueBreakdownColumn(params.target.column)) {
    updated = {
      ...updated,
      [params.target.column]: toNum((updated[params.target.column] ?? 0) + delta),
    };
  } else if (isPlCategoryColumn(params.target.column)) {
    updated = {
      ...updated,
      [params.target.column]: toNum((updated[params.target.column] ?? 0) + delta),
    };
  } else {
    return { error: `Invalid financial category: ${params.target.column}` };
  }

  const breakdown = {
    self_service_revenue: toNum(updated.self_service_revenue),
    wdf_revenue: toNum(updated.wdf_revenue),
    commercial_revenue: toNum(updated.commercial_revenue),
    vending_revenue: toNum(updated.vending_revenue),
    other_revenue: toNum(updated.other_revenue),
  };

  const payload = {
    store_id: params.storeId,
    user_id: params.userId,
    year: toNum(params.year),
    month: toNum(params.month),
    self_service_revenue: breakdown.self_service_revenue,
    wdf_revenue: breakdown.wdf_revenue,
    commercial_revenue: breakdown.commercial_revenue,
    vending_revenue: breakdown.vending_revenue,
    other_revenue: breakdown.other_revenue,
    revenue: sumRevenueBreakdown(breakdown),
    utilities: existing?.utilities ?? 0,
    rent: toNum(updated.rent),
    payroll: toNum(updated.payroll),
    repairs_maintenance: toNum(updated.repairs_maintenance),
    insurance_expense: toNum(updated.insurance_expense),
    supplies: toNum(updated.supplies),
    marketing: toNum(updated.marketing),
    professional_fees: toNum(updated.professional_fees),
    software_subscriptions: toNum(updated.software_subscriptions),
    cc_processing_fees: toNum(updated.cc_processing_fees),
    bank_charges: toNum(updated.bank_charges),
    other_expenses: toNum(updated.other_expenses),
    debt_service: toNum(updated.debt_service),
    notes: toNullableText(updated.notes),
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("monthly_financials")
      .update(payload)
      .eq("id", existing.id);
    return { error: error?.message ?? null };
  }

  const { error } = await supabase.from("monthly_financials").insert(payload);
  return { error: error?.message ?? null };
}

export async function postTransactionsBatch(
  supabase: FinancialsSupabaseClient,
  params: PostTransactionsBatchParams
): Promise<PostTransactionsBatchResult> {
  const {
    storeId,
    userId,
    transactions,
    existingRecords = [],
    existingUtilityRecords = [],
    store = null,
    changeSource = "user",
  } = params;

  if (transactions.length === 0) {
    return { postedCount: 0, error: null };
  }

  const txnIds = transactions.map((t) => t.id);
  const { data: existingLinks, error: linksFetchError } = await supabase
    .from("transaction_pl_links")
    .select("transaction_id")
    .in("transaction_id", txnIds);

  if (linksFetchError) {
    return { postedCount: 0, error: linksFetchError.message };
  }

  const linkedIds = new Set(
    (existingLinks ?? []).map((l: { transaction_id: string }) => l.transaction_id)
  );

  const postableTransactions = transactions.filter(
    (txn) => (txn.status ?? "needs_review") !== "posted" && !linkedIds.has(txn.id)
  );

  if (postableTransactions.length === 0) {
    return { postedCount: 0, error: null };
  }

  for (const txn of postableTransactions) {
    if (!txn.id) {
      return { postedCount: 0, error: "Each transaction must have an id before posting." };
    }
    if (!isCategoryReadyToPost(txn.category)) {
      return {
        postedCount: 0,
        error: "Assign a category before posting. Transactions marked Needs Review cannot be posted.",
      };
    }
    if (!resolvePostingTarget(txn.category)) {
      return {
        postedCount: 0,
        error: "This category cannot be posted. Re-categorize the transaction and try again.",
      };
    }
  }

  type BatchItem = {
    txn: BatchPostTransaction;
    year: number;
    month: number;
    amount: number;
    importCategory: BankImportCategory;
    postingTarget: PostingTarget;
  };

  const items: BatchItem[] = postableTransactions.map((txn) => {
    const date = new Date(txn.transaction_date.split("T")[0] + "T12:00:00");
    const importCategory = txn.category;
    const postingTarget = resolvePostingTarget(importCategory)!;

    return {
      txn,
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      amount: normalizeTransactionAmount(txn.amount),
      importCategory,
      postingTarget,
    };
  });

  const utilityDeltaMap = new Map<string, Record<UtilityImportField, number>>();
  const revenueDeltaMap = new Map<string, Partial<Record<RevenueBreakdownField, number>>>();
  const financialDeltaMap = new Map<string, Partial<Record<PlCategoryField, number>>>();

  for (const item of items) {
    const periodKey = monthKey(item.year, item.month);

    if (isRevenueBreakdownColumn(item.postingTarget.column)) {
      const deltas = revenueDeltaMap.get(periodKey) ?? {};
      const column = item.postingTarget.column;
      deltas[column] = (deltas[column] ?? 0) + item.amount;
      revenueDeltaMap.set(periodKey, deltas);
    } else if (item.postingTarget.table === "monthly_utilities") {
      const deltas = utilityDeltaMap.get(periodKey) ?? emptyUtilityDelta();
      const column = item.postingTarget.column as UtilityImportField;
      deltas[column] += item.amount;
      utilityDeltaMap.set(periodKey, deltas);
    } else {
      const column = item.postingTarget.column as PlCategoryField;
      const fieldDeltas = financialDeltaMap.get(periodKey) ?? {};
      fieldDeltas[column] = (fieldDeltas[column] ?? 0) + item.amount;
      financialDeltaMap.set(periodKey, fieldDeltas);
    }
  }

  try {
    if (utilityDeltaMap.size > 0) {
      const utilityRowsByPeriod = new Map(
        existingUtilityRecords.map((row) => [monthKey(row.year, row.month), row])
      );

      for (const [periodKey, deltas] of Array.from(utilityDeltaMap.entries())) {
        const { year, month } = parseMonthPeriodKey(periodKey);
        const existing = utilityRowsByPeriod.get(periodKey) ?? null;

        const payload = {
          store_id: storeId,
          user_id: userId,
          year: toNum(year),
          month: toNum(month),
          water: toNum((existing?.water ?? 0) + deltas.water),
          gas: toNum((existing?.gas ?? 0) + deltas.gas),
          electric: toNum((existing?.electric ?? 0) + deltas.electric),
          sewer: toNum((existing?.sewer ?? 0) + deltas.sewer),
          trash: toNum((existing?.trash ?? 0) + deltas.trash),
          internet: toNum((existing?.internet ?? 0) + deltas.internet),
          notes: (existing as { notes?: string | null } | null)?.notes ?? null,
        };

        const { error: upsertError } = await supabase
          .from("monthly_utilities")
          .upsert(payload, { onConflict: "store_id,year,month" });

        if (upsertError) return { postedCount: 0, error: upsertError.message };
      }
    }

    const financialPeriodKeys = new Set([
      ...Array.from(revenueDeltaMap.keys()),
      ...Array.from(financialDeltaMap.keys()),
    ]);

    for (const periodKey of Array.from(financialPeriodKeys)) {
      const { year, month } = parseMonthPeriodKey(periodKey);
      const existing = existingRecords.find((r) => r.year === year && r.month === month) ?? null;
      const base = existing
        ? recordToForm(calcMonthly(existing))
        : { ...emptyMonthlyForm(store), year, month };
      const revenueDeltas = revenueDeltaMap.get(periodKey) ?? {};
      const fieldDeltas = financialDeltaMap.get(periodKey) ?? {};

      let updated = { ...base };
      for (const [field, delta] of Object.entries(fieldDeltas) as [PlCategoryField, number][]) {
        updated = {
          ...updated,
          [field]: toNum((updated[field] ?? 0) + delta),
        };
      }

      const breakdown = {
        self_service_revenue: toNum(
          (base.self_service_revenue ?? 0) + (revenueDeltas.self_service_revenue ?? 0)
        ),
        wdf_revenue: toNum((base.wdf_revenue ?? 0) + (revenueDeltas.wdf_revenue ?? 0)),
        commercial_revenue: toNum(
          (base.commercial_revenue ?? 0) + (revenueDeltas.commercial_revenue ?? 0)
        ),
        vending_revenue: toNum((base.vending_revenue ?? 0) + (revenueDeltas.vending_revenue ?? 0)),
        other_revenue: toNum((base.other_revenue ?? 0) + (revenueDeltas.other_revenue ?? 0)),
      };

      const payload = {
        store_id: storeId,
        user_id: userId,
        year: toNum(year),
        month: toNum(month),
        self_service_revenue: breakdown.self_service_revenue,
        wdf_revenue: breakdown.wdf_revenue,
        commercial_revenue: breakdown.commercial_revenue,
        vending_revenue: breakdown.vending_revenue,
        other_revenue: breakdown.other_revenue,
        revenue: sumRevenueBreakdown(breakdown),
        utilities: existing?.utilities ?? 0,
        rent: toNum(updated.rent),
        payroll: toNum(updated.payroll),
        repairs_maintenance: toNum(updated.repairs_maintenance),
        insurance_expense: toNum(updated.insurance_expense),
        supplies: toNum(updated.supplies),
        marketing: toNum(updated.marketing),
        professional_fees: toNum(updated.professional_fees),
        software_subscriptions: toNum(updated.software_subscriptions),
        cc_processing_fees: toNum(updated.cc_processing_fees),
        bank_charges: toNum(updated.bank_charges),
        other_expenses: toNum(updated.other_expenses),
        debt_service: toNum(updated.debt_service),
        notes: toNullableText(updated.notes),
      };

      if (existing?.id) {
        const { error } = await supabase
          .from("monthly_financials")
          .update(payload)
          .eq("id", existing.id);
        if (error) return { postedCount: 0, error: error.message };
      } else {
        const { error } = await supabase.from("monthly_financials").insert(payload);
        if (error) return { postedCount: 0, error: error.message };
      }
    }

    for (const item of items) {
      const { txn, year, month, amount, importCategory, postingTarget } = item;
      const previousStatus = txn.status ?? "needs_review";
      const now = new Date().toISOString();

      const { error: linkError } = await supabase.from("transaction_pl_links").insert({
        transaction_id: txn.id,
        store_id: storeId,
        year,
        month,
        category: postingTarget.column,
        amount_applied: amount,
      });

      if (linkError) return { postedCount: 0, error: linkError.message };

      const updatePayload: Record<string, unknown> = {
        is_reviewed: true,
        status: "posted",
        modified_at: now,
      };

      if (!txn.original_category) {
        updatePayload.original_category = importCategory;
      }

      const { error: txnError } = await supabase
        .from("bank_transactions")
        .update(updatePayload)
        .eq("id", txn.id);

      if (txnError) return { postedCount: 0, error: txnError.message };

      const { error: auditError } = await writeTransactionAuditLog(supabase, {
        transactionId: txn.id,
        storeId,
        userId,
        fieldChanged: "status",
        oldValue: previousStatus,
        newValue: "posted",
        changeSource,
      });

      if (auditError) return { postedCount: 0, error: auditError };
    }

    return { postedCount: postableTransactions.length, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to post transactions.";
    return { postedCount: 0, error: message };
  }
}

export async function excludeTransaction(
  supabase: FinancialsSupabaseClient,
  transactionId: string,
  reason: string,
  userId: string,
  store?: StoreFinancialProfile | null
): Promise<{ error: string | null }> {
  const { data: transaction, error: fetchError } = await supabase
    .from("bank_transactions")
    .select("*")
    .eq("id", transactionId)
    .single();

  if (fetchError || !transaction) {
    return { error: fetchError?.message ?? "Transaction not found." };
  }

  const bankTxn = transaction as BankTransaction;
  const previousCategory = bankTxn.category;

  const { data: plLink, error: plLinkError } = await supabase
    .from("transaction_pl_links")
    .select("*")
    .eq("transaction_id", transactionId)
    .maybeSingle();

  if (plLinkError) {
    return { error: plLinkError.message };
  }

  if (plLink) {
    const link = plLink as TransactionPlLink;
    const target = postingTargetFromStoredCategory(link.category);

    const { error: reverseError } = await applyPostingDelta(supabase, {
      storeId: bankTxn.store_id,
      userId,
      year: link.year,
      month: link.month,
      target,
      amount: toNum(link.amount_applied),
      reverse: true,
      store,
    });

    if (reverseError) return { error: reverseError };

    const { error: deleteLinkError } = await supabase
      .from("transaction_pl_links")
      .delete()
      .eq("id", link.id);

    if (deleteLinkError) return { error: deleteLinkError.message };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("bank_transactions")
    .update({
      excluded: true,
      status: "excluded",
      exclusion_reason: reason,
      modified_at: now,
    })
    .eq("id", transactionId);

  if (updateError) return { error: updateError.message };

  const { error: auditError } = await writeTransactionAuditLog(supabase, {
    transactionId,
    storeId: bankTxn.store_id,
    userId,
    fieldChanged: "excluded",
    oldValue: previousCategory,
    newValue: "excluded",
    changeSource: "user",
  });

  return { error: auditError };
}

export async function reclassifyPostedTransaction(
  supabase: FinancialsSupabaseClient,
  transactionId: string,
  newCategory: BankImportCategory,
  userId: string,
  store?: StoreFinancialProfile | null
): Promise<{ error: string | null }> {
  if (!isCategoryReadyToPost(newCategory)) {
    return { error: "Choose a postable category before reclassifying." };
  }

  const newTarget = resolvePostingTarget(newCategory);
  if (!newTarget) {
    return { error: "This category cannot be posted to P&L." };
  }

  const { data: transaction, error: fetchError } = await supabase
    .from("bank_transactions")
    .select("*")
    .eq("id", transactionId)
    .single();

  if (fetchError || !transaction) {
    return { error: fetchError?.message ?? "Transaction not found." };
  }

  const bankTxn = transaction as BankTransaction;
  const previousCategory = bankTxn.category;

  const { data: plLink, error: plLinkError } = await supabase
    .from("transaction_pl_links")
    .select("*")
    .eq("transaction_id", transactionId)
    .maybeSingle();

  if (plLinkError) {
    return { error: plLinkError.message };
  }

  if (plLink) {
    const link = plLink as TransactionPlLink;
    const oldTarget = postingTargetFromStoredCategory(link.category);

    const { error: reverseError } = await applyPostingDelta(supabase, {
      storeId: bankTxn.store_id,
      userId,
      year: link.year,
      month: link.month,
      target: oldTarget,
      amount: toNum(link.amount_applied),
      reverse: true,
      store,
    });

    if (reverseError) return { error: reverseError };

    const { error: applyError } = await applyPostingDelta(supabase, {
      storeId: bankTxn.store_id,
      userId,
      year: link.year,
      month: link.month,
      target: newTarget,
      amount: toNum(link.amount_applied),
      store,
    });

    if (applyError) return { error: applyError };

    const { error: linkUpdateError } = await supabase
      .from("transaction_pl_links")
      .update({ category: newTarget.column })
      .eq("id", link.id);

    if (linkUpdateError) return { error: linkUpdateError.message };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("bank_transactions")
    .update({
      category: newCategory,
      status: "user_classified",
      modified_at: now,
    })
    .eq("id", transactionId);

  if (updateError) return { error: updateError.message };

  const { error: auditError } = await writeTransactionAuditLog(supabase, {
    transactionId,
    storeId: bankTxn.store_id,
    userId,
    fieldChanged: "category",
    oldValue: previousCategory,
    newValue: newCategory,
    changeSource: "user",
  });

  return { error: auditError };
}
