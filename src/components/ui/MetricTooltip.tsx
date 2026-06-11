"use client";
import { useState } from "react";

export function MetricTooltip({ label, explanation }: { label: string; explanation: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: "4px" }}>
      <span
        style={{ fontSize: "11px", color: "var(--text-muted)", cursor: "help" }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        {label} ⓘ
      </span>
      {open && (
        <span
          style={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            zIndex: 50,
            background: "var(--bg-card)",
            border: "1px solid var(--border2)",
            borderRadius: "8px",
            padding: "8px 12px",
            fontSize: "12px",
            color: "var(--text-secondary)",
            width: "220px",
            lineHeight: 1.5,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            marginBottom: "4px",
          }}
        >
          {explanation}
        </span>
      )}
    </span>
  );
}
