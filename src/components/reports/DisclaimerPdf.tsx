import { Text } from "@react-pdf/renderer";
import { type DisclaimerVariant, getDisclaimerText } from "@/lib/disclaimerText";

type DisclaimerPdfProps = {
  variant: Exclude<DisclaimerVariant, "tooltip">;
};

/** PDF-compatible disclaimer for @react-pdf/renderer documents. */
export function DisclaimerPdf({ variant }: DisclaimerPdfProps) {
  if (variant === "valuation") {
    return (
      <Text style={{ fontSize: 7, color: "#94a3b8", marginTop: 2, lineHeight: 1.35 }}>
        {getDisclaimerText(variant)}
      </Text>
    );
  }

  if (variant === "report-footer") {
    return (
      <Text style={{ fontSize: 7, color: "#94a3b8", lineHeight: 1.35, marginTop: 4 }}>
        {getDisclaimerText(variant)}
      </Text>
    );
  }

  return (
    <Text style={{ fontSize: 8, color: "#64748b", lineHeight: 1.45 }}>
      {getDisclaimerText(variant)}
    </Text>
  );
}
