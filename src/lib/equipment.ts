export type MachineType = "Washer" | "Dryer";
export type MachineCondition = "Excellent" | "Good" | "Fair" | "Poor";

export type EquipmentRecord = {
  id: string;
  user_id: string;
  store_id: string;
  machine_type: MachineType;
  manufacturer: string;
  machine_size: string;
  quantity: number;
  installation_year: number;
  high_speed_extract: boolean | null;
  condition: MachineCondition;
  notes: string | null;
};

export const MANUFACTURERS = [
  "Speed Queen",
  "Dexter",
  "Huebsch",
  "Maytag",
  "Continental Girbau",
  "Wascomat",
  "Other",
] as const;

export const WASHER_SIZES = ["20lb", "30lb", "40lb", "60lb", "80lb", "100lb", "Custom"] as const;
export const DRYER_SIZES = ["30lb Stack", "45lb Stack", "75lb Single", "Custom"] as const;
export const CONDITIONS: MachineCondition[] = ["Excellent", "Good", "Fair", "Poor"];

const REPLACEMENT_COSTS: Record<string, number> = {
  "20lb": 3500,
  "30lb": 5000,
  "40lb": 7000,
  "60lb": 9500,
  "80lb": 13000,
  "100lb": 18000,
  "30lb Stack": 4500,
  "45lb Stack": 6500,
  "75lb Single": 8000,
  Custom: 6000,
};

export function getReplacementCostPerUnit(machineSize: string): number {
  return REPLACEMENT_COSTS[machineSize] ?? 6000;
}

export function getGroupReplacementCost(item: Pick<EquipmentRecord, "machine_size" | "quantity">): number {
  return getReplacementCostPerUnit(item.machine_size) * item.quantity;
}

export type AgeBucket = {
  label: string;
  count: number;
  pct: number;
  color: string;
  textColor: string;
};

export type EquipmentMetrics = {
  totalWashers: number;
  totalDryers: number;
  totalMachines: number;
  weightedAvgAge: number;
  ageBuckets: AgeBucket[];
  pctUnder10Years: number;
  pctUnder5Years: number;
  pct200GWashers: number;
  qualityScore: number;
  grade: "A" | "B" | "C" | "D";
  baseEquipmentAdjustment: number;
  bonus200GAdjustment: number;
  totalEquipmentAdjustment: number;
  estimatedReplacementValue: number;
};

function getBaseEquipmentAdjustment(avgAge: number): number {
  if (avgAge < 5) return 0.5;
  if (avgAge < 8) return 0.25;
  if (avgAge < 12) return 0;
  if (avgAge < 15) return -0.25;
  return -0.5;
}

export function getEquipmentQualityScore(
  avgAge: number,
  pctUnder10Years: number,
  pct200GWashers: number,
  equipment: Pick<EquipmentRecord, "condition" | "quantity">[]
): number {
  let score = 60;

  if (avgAge < 5) score += 30;
  else if (avgAge < 8) score += 20;
  else if (avgAge < 12) score += 10;
  else if (avgAge >= 15) score -= 10;

  if (pctUnder10Years > 80) score += 10;
  if (pct200GWashers > 50) score += 5;

  const poorGroups = equipment.filter((e) => e.condition === "Poor").length;
  score -= poorGroups * 10;

  if (equipment.length > 0 && equipment.every((e) => e.condition === "Excellent")) {
    score += 5;
  }

  return Math.min(100, Math.max(0, score));
}

export function getEquipmentGrade(score: number): "A" | "B" | "C" | "D" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  return "D";
}

export function computeEquipmentMetrics(
  equipment: EquipmentRecord[],
  currentYear = new Date().getFullYear()
): EquipmentMetrics {
  const totalWashers = equipment
    .filter((e) => e.machine_type === "Washer")
    .reduce((s, e) => s + e.quantity, 0);

  const totalDryers = equipment
    .filter((e) => e.machine_type === "Dryer")
    .reduce((s, e) => s + e.quantity, 0);

  const totalMachines = totalWashers + totalDryers;

  const weightedAgeSum = equipment.reduce(
    (s, e) => s + e.quantity * (currentYear - e.installation_year),
    0
  );
  const weightedAvgAge = totalMachines > 0 ? weightedAgeSum / totalMachines : 0;

  let under5 = 0;
  let bucket5to10 = 0;
  let bucket10to15 = 0;
  let over15 = 0;
  let under10 = 0;

  for (const item of equipment) {
    const age = currentYear - item.installation_year;
    if (age < 5) under5 += item.quantity;
    if (age >= 5 && age < 10) bucket5to10 += item.quantity;
    if (age >= 10 && age < 15) bucket10to15 += item.quantity;
    if (age >= 15) over15 += item.quantity;
    if (age < 10) under10 += item.quantity;
  }

  const pct = (count: number) => (totalMachines > 0 ? (count / totalMachines) * 100 : 0);

  const washers200G = equipment
    .filter((e) => e.machine_type === "Washer" && e.high_speed_extract)
    .reduce((s, e) => s + e.quantity, 0);

  const pct200GWashers = totalWashers > 0 ? (washers200G / totalWashers) * 100 : 0;
  const pctUnder10Years = pct(under10);
  const pctUnder5Years = pct(under5);

  const qualityScore = getEquipmentQualityScore(
    weightedAvgAge,
    pctUnder10Years,
    pct200GWashers,
    equipment
  );

  const baseEquipmentAdjustment = getBaseEquipmentAdjustment(weightedAvgAge);
  const bonus200GAdjustment = pct200GWashers > 50 ? 0.1 : 0;

  const estimatedReplacementValue = equipment.reduce(
    (s, e) => s + getGroupReplacementCost(e),
    0
  );

  return {
    totalWashers,
    totalDryers,
    totalMachines,
    weightedAvgAge,
    ageBuckets: [
      {
        label: "Under 5 years",
        count: under5,
        pct: pct(under5),
        color: "bg-green-500",
        textColor: "text-green-400",
      },
      {
        label: "5–10 years",
        count: bucket5to10,
        pct: pct(bucket5to10),
        color: "bg-blue-500",
        textColor: "text-blue-400",
      },
      {
        label: "10–15 years",
        count: bucket10to15,
        pct: pct(bucket10to15),
        color: "bg-amber-500",
        textColor: "text-amber-400",
      },
      {
        label: "15+ years",
        count: over15,
        pct: pct(over15),
        color: "bg-red-500",
        textColor: "text-red-400",
      },
    ],
    pctUnder10Years,
    pctUnder5Years,
    pct200GWashers,
    qualityScore,
    grade: getEquipmentGrade(qualityScore),
    baseEquipmentAdjustment,
    bonus200GAdjustment,
    totalEquipmentAdjustment: baseEquipmentAdjustment + bonus200GAdjustment,
    estimatedReplacementValue,
  };
}

export function computeWeightedAvgAge(
  equipment: Pick<EquipmentRecord, "quantity" | "installation_year">[],
  currentYear = new Date().getFullYear()
): number {
  const totalMachines = equipment.reduce((s, e) => s + e.quantity, 0);
  if (totalMachines === 0) return 0;
  const weightedAgeSum = equipment.reduce(
    (s, e) => s + e.quantity * (currentYear - e.installation_year),
    0
  );
  return weightedAgeSum / totalMachines;
}

export function computePct200GWashers(
  equipment: Pick<EquipmentRecord, "machine_type" | "quantity" | "high_speed_extract">[]
): number {
  const totalWashers = equipment
    .filter((e) => e.machine_type === "Washer")
    .reduce((s, e) => s + e.quantity, 0);
  if (totalWashers === 0) return 0;
  const washers200G = equipment
    .filter((e) => e.machine_type === "Washer" && e.high_speed_extract)
    .reduce((s, e) => s + e.quantity, 0);
  return (washers200G / totalWashers) * 100;
}

export function ageColor(age: number): string {
  if (age < 8) return "text-green-400";
  if (age < 12) return "text-amber-400";
  return "text-red-400";
}

export function avgAgeColor(avgAge: number): string {
  if (avgAge < 8) return "text-green-400";
  if (avgAge < 12) return "text-amber-400";
  return "text-red-400";
}

export function gradeColor(grade: "A" | "B" | "C" | "D"): string {
  if (grade === "A") return "text-green-400";
  if (grade === "B") return "text-blue-400";
  if (grade === "C") return "text-amber-400";
  return "text-red-400";
}

export function adjustmentColor(value: number): string {
  if (value > 0) return "text-green-400";
  if (value < 0) return "text-red-400";
  return "text-slate-400";
}

export function formatAdjustment(value: number): string {
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toFixed(2)}x`;
}
