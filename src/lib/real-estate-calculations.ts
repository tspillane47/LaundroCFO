export type RealEstateInputs = {
  estimated_value: number | null;
  current_loan_balance: number | null;
  monthly_rent_charged: number | null;
  market_rent_estimate: number | null;
  laundromat_square_footage: number | null;
  monthly_mortgage_payment: number | null;
  same_entity_as_laundromat: boolean | null;
};

export function calcBuildingEquity(
  estimatedValue: number | null,
  loanBalance: number | null
): number | null {
  if (estimatedValue == null || loanBalance == null) return null;
  return estimatedValue - loanBalance;
}

export function calcRealEstateLTV(
  loanBalance: number | null,
  estimatedValue: number | null
): number | null {
  if (estimatedValue == null || estimatedValue <= 0 || loanBalance == null) return null;
  return (loanBalance / estimatedValue) * 100;
}

export function calcRentPerSquareFoot(
  monthlyRentCharged: number | null,
  sqft: number | null
): number | null {
  if (monthlyRentCharged == null || sqft == null || sqft <= 0) return null;
  return (monthlyRentCharged * 12) / sqft;
}

export function calcOccupancyCostRatioFromRent(
  monthlyRentCharged: number | null,
  monthlyRevenue: number | null
): number | null {
  if (monthlyRentCharged == null || monthlyRevenue == null || monthlyRevenue <= 0) return null;
  return (monthlyRentCharged / monthlyRevenue) * 100;
}

export function calcMarketRentDifference(
  monthlyRentCharged: number | null,
  marketRent: number | null
): number | null {
  if (monthlyRentCharged == null || marketRent == null) return null;
  return monthlyRentCharged - marketRent;
}

export function calcCombinedValueEstimate(
  businessValue: number,
  estimatedValue: number | null
): number | null {
  if (estimatedValue == null) return null;
  return businessValue + estimatedValue;
}

export type UnderwritingFlag = {
  type: "amber" | "blue" | "red" | "green";
  message: string;
};

export function getUnderwritingFlags(params: {
  monthlyRentCharged: number | null;
  marketRentEstimate: number | null;
  sameEntityAsLaundromat: boolean | null;
  monthlyMortgagePayment: number | null;
  buildingEquity: number | null;
}): UnderwritingFlag[] {
  const flags: UnderwritingFlag[] = [];

  if (params.monthlyRentCharged != null && params.marketRentEstimate != null) {
    if (params.monthlyRentCharged < params.marketRentEstimate) {
      flags.push({
        type: "amber",
        message: "Rent is below market. Store EBITDA may be overstated.",
      });
    } else if (params.monthlyRentCharged > params.marketRentEstimate) {
      flags.push({
        type: "amber",
        message: "Rent is above market. Store EBITDA may be understated.",
      });
    }
  }

  if (params.sameEntityAsLaundromat === false) {
    flags.push({
      type: "blue",
      message:
        "Related-party landlord relationship. Lenders will scrutinize rent terms.",
    });
  }

  if (
    params.monthlyMortgagePayment != null &&
    params.monthlyRentCharged != null &&
    params.monthlyMortgagePayment > params.monthlyRentCharged
  ) {
    flags.push({
      type: "red",
      message:
        "Mortgage payment exceeds rent charged. Potential real estate cash flow issue.",
    });
  }

  if (params.buildingEquity != null && params.buildingEquity > 0) {
    flags.push({
      type: "green",
      message: `Property has equity of $${params.buildingEquity.toLocaleString("en-US", { maximumFractionDigits: 0 })}. May serve as additional collateral.`,
    });
  }

  return flags;
}

const FLAG_STYLES: Record<UnderwritingFlag["type"], string> = {
  amber: "bg-amber-500/8 border-amber-500/20 text-amber-300",
  blue: "bg-blue-500/8 border-blue-500/20 text-blue-300",
  red: "bg-red-500/8 border-red-500/20 text-red-400",
  green: "bg-green-500/8 border-green-500/20 text-green-400",
};

export function flagStyle(type: UnderwritingFlag["type"]): string {
  return FLAG_STYLES[type];
}
