export type MonthlyFinancialRecord = {
  id: string;
  store_id: string;
  user_id?: string;
  year: number;
  month: number;
  revenue: number;
  utilities: number;
  rent: number;
  payroll: number;
  repairs_maintenance: number;
  insurance_expense: number;
  supplies: number;
  marketing: number;
  professional_fees: number;
  other_expenses: number;
  debt_service: number;
  notes?: string | null;
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

export type BankTransaction = {
  id: string;
  store_id: string;
  user_id?: string;
  transaction_date: string;
  description: string | null;
  amount: number;
  category: string | null;
  is_reviewed: boolean;
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
  const revenue = num(record.revenue);
  const utilities = num(record.utilities);
  const rent = num(record.rent);
  const payroll = num(record.payroll);
  const repairs_maintenance = num(record.repairs_maintenance);
  const insurance_expense = num(record.insurance_expense);
  const supplies = num(record.supplies);
  const marketing = num(record.marketing);
  const professional_fees = num(record.professional_fees);
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
    other_expenses;

  const grossProfit = revenue - utilities - supplies - repairs_maintenance;
  const ebitda = revenue - totalExpenses;
  const ebitdaMargin = revenue > 0 ? (ebitda / revenue) * 100 : 0;
  const noi = ebitda - debt_service;

  return {
    ...record,
    revenue,
    utilities,
    rent,
    payroll,
    repairs_maintenance,
    insurance_expense,
    supplies,
    marketing,
    professional_fees,
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

export function enrichMonthlyRecords(records: MonthlyFinancialRecord[]): CalculatedMonthly[] {
  return records.map(calcMonthly);
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
    utilities: 0,
    rent: num(store?.monthly_rent),
    payroll: 0,
    repairs_maintenance: 0,
    insurance_expense: 0,
    supplies: 0,
    marketing: 0,
    professional_fees: 0,
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
    utilities: record.utilities,
    rent: record.rent,
    payroll: record.payroll,
    repairs_maintenance: record.repairs_maintenance,
    insurance_expense: record.insurance_expense,
    supplies: record.supplies,
    marketing: record.marketing,
    professional_fees: record.professional_fees,
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
  "other_expenses",
  "debt_service",
] as const;

export type PlCategoryField = (typeof PL_CATEGORY_FIELDS)[number];

export type TransactionType = "income" | "expense";

/** Categories shown in bank import review (extends P&L fields with import-only options). */
export type BankImportCategory =
  | PlCategoryField
  | "other_income"
  | "bank_fees"
  | "needs_review";

export const INCOME_IMPORT_CATEGORIES: BankImportCategory[] = [
  "revenue",
  "other_income",
  "needs_review",
];

export const EXPENSE_IMPORT_CATEGORIES: BankImportCategory[] = [
  "utilities",
  "rent",
  "payroll",
  "repairs_maintenance",
  "insurance_expense",
  "supplies",
  "marketing",
  "professional_fees",
  "debt_service",
  "bank_fees",
  "other_expenses",
  "needs_review",
];

export const BANK_IMPORT_CATEGORY_LABELS: Record<BankImportCategory, string> = {
  revenue: "Revenue",
  other_income: "Other Income",
  utilities: "Utilities",
  rent: "Rent",
  payroll: "Payroll",
  repairs_maintenance: "Repairs & Maintenance",
  insurance_expense: "Insurance",
  supplies: "Supplies",
  marketing: "Marketing",
  professional_fees: "Professional Fees",
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
    "sales",
    "income",
    "revenue",
    "ach credit",
    "remote deposit",
  ],
  utilities: [
    "electric",
    "power",
    "pg&e",
    "pge",
    "national grid",
    "eversource",
    "green mountain power",
    "gmp",
    "water",
    "sewer",
    "gas company",
    "utility",
    "utilities",
    "edison",
    "gas",
    "culligan",
    "water softener",
  ],
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
  professional_fees: ["accountant", "cpa", "legal", "attorney", "bookkeeping", "quickbooks", "consult"],
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

const OTHER_INCOME_KEYWORDS = ["interest earned", "refund", "rebate", "insurance proceeds", "grant"];

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
  "utilities",
  "rent",
  "payroll",
  "repairs_maintenance",
  "insurance_expense",
  "supplies",
  "marketing",
  "professional_fees",
  "debt_service",
];

export function isCategoryReadyToPost(category: BankImportCategory): boolean {
  return category !== "needs_review";
}

export function mapBankCategoryToPlField(category: BankImportCategory): PlCategoryField | null {
  if (category === "needs_review") return null;
  if (category === "other_income") return "revenue";
  if (category === "bank_fees") return "other_expenses";
  return category;
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
    for (const keyword of OTHER_INCOME_KEYWORDS) {
      if (text.includes(keyword)) return "other_income";
    }
    for (const keyword of CATEGORY_KEYWORDS.revenue) {
      if (text.includes(keyword.toLowerCase())) return "revenue";
    }
    return "revenue";
  }

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

export function inferTransactionType(
  amount: number,
  category?: string | null
): TransactionType {
  if (category === "revenue") return "income";
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
  return line.match(/(".*?"|[^,]+)/g)?.map((c) => c.trim().replace(/^"|"$/g, "")) ?? line.split(",");
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
