import { Text, View } from "@react-pdf/renderer";
import { getDisclaimerText } from "@/lib/disclaimerText";

type PdfPageChromeProps = {
  storeName: string;
  generatedDate: string;
  variant?: "store" | "portfolio";
};

export function PdfPageChrome({ storeName, generatedDate, variant = "store" }: PdfPageChromeProps) {
  const headerLine =
    variant === "portfolio"
      ? `LaundroCFO · Portfolio · ${generatedDate} · Confidential`
      : `LaundroCFO · ${storeName} · ${generatedDate} · Confidential`;

  return (
    <View
      fixed
      style={{
        position: "absolute",
        bottom: 22,
        left: 40,
        right: 40,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 3,
        }}
      >
        <Text style={{ fontSize: 8, color: "#64748b", flex: 1, paddingRight: 12 }} wrap={false}>
          {headerLine}
        </Text>
        <Text
          style={{ fontSize: 8, color: "#64748b" }}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
      </View>
      <Text style={{ fontSize: 7, color: "#94a3b8", lineHeight: 1.35 }}>
        {getDisclaimerText("report-footer")}
      </Text>
    </View>
  );
}
