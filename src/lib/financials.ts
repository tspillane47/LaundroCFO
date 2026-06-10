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

export const CATEGORY_KEYWORDS: Record<PlCategoryField, string[]> = {
  revenue: ["coin", "card", "fascard", "laundrynet", "payment", "deposit", "sales", "income", "revenue"],
  utilities: ["pge", "pg&e", "edison", "electric", "gas", "water", "utility", "utilities", "power"],
  rent: ["rent", "lease", "landlord", "cam", "property mgmt"],
  payroll: ["payroll", "gusto", "adp", "paychex", "salary", "wages", "employee"],
  repairs_maintenance: ["repair", "maintenance", "hvac", "plumb", "service call", "dexter", "speed queen"],
  insurance_expense: ["insurance", "premium", "liability", "policy"],
  supplies: ["supply", "supplies", "detergent", "chemical", "vending", "soap"],
  marketing: ["marketing", "advert", "google ads", "facebook", "promo"],
  professional_fees: ["accountant", "attorney", "legal", "cpa", "consult"],
  other_expenses: ["bank fee", "misc", "other", "office"],
  debt_service: ["loan", "mortgage", "debt", "sba", "principal", "interest"],
};

export function suggestTransactionCategory(description: string | null): PlCategoryField {
  const text = (description ?? "").toLowerCase();
  let best: PlCategoryField = "other_expenses";
  let bestScore = 0;

  for (const field of PL_CATEGORY_FIELDS) {
    for (const keyword of CATEGORY_KEYWORDS[field]) {
      if (text.includes(keyword) && keyword.length > bestScore) {
        best = field;
        bestScore = keyword.length;
      }
    }
  }

  return best;
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
