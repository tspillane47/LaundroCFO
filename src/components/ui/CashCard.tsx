"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { INPUT_CLASS } from "@/components/occupancy/shared";
import { computeStoreCashPosition } from "@/lib/cashPosition";
import type { PlaidBalanceSnapshot } from "@/lib/plaid-shared";
import { LiveFromBankBadge } from "@/components/ui/CashPositionIndicator";
import { MANUAL_CASH_SUBTEXT } from "@/components/ui/BankBalancesPanel";

interface CashCardProps {
  store: any;
  hasFinancialData?: boolean;
  hasPlaidConnection?: boolean;
  plaidSnapshot?: PlaidBalanceSnapshot | null;
  onUpdate?: (updatedStore: any) => void;
}

export function CashCard({
  store,
  hasFinancialData = true,
  hasPlaidConnection = false,
  plaidSnapshot = null,
  onUpdate,
}: CashCardProps) {
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [operating, setOperating] = useState(store?.operating_account_balance ?? 0);
  const [reserve, setReserve] = useState(store?.reserve_account_balance ?? 0);
  const [petty, setPetty] = useState(store?.petty_cash ?? 0);

  const manualCash = Number(operating) + Number(reserve) + Number(petty);
  const cashPosition = computeStoreCashPosition(
    {
      operating_account_balance: Number(operating),
      reserve_account_balance: Number(reserve),
      petty_cash: Number(petty),
    },
    hasPlaidConnection,
    plaidSnapshot ?? undefined
  );
  const displayCash = cashPosition.amount;
  const isLiveFromBank = cashPosition.source === "plaid";

  async function handleSave() {
    setSaving(true);
    setError("");
    const { data, error: saveError } = await supabase
      .from("stores")
      .update({
        operating_account_balance: Number(operating) || 0,
        reserve_account_balance: Number(reserve) || 0,
        petty_cash: Number(petty) || 0,
        cash_last_updated: new Date().toISOString(),
        cash_source: "manual",
      })
      .eq("id", store.id)
      .select()
      .single();

    if (saveError) {
      setError("We couldn't save cash balances. Please try again.");
      setSaving(false);
      return;
    }

    if (data && onUpdate) onUpdate(data);
    setSaving(false);
    setEditing(false);
  }

  const inputClass = INPUT_CLASS;

  const lastUpdated = store?.cash_last_updated
    ? new Date(store.cash_last_updated).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div className="metric-label">Cash Position</div>
        <button
          type="button"
          className="btn-outline"
          style={{ fontSize: "11px", padding: "3px 10px" }}
          onClick={() => {
            setError("");
            setEditing(!editing);
          }}
          disabled={!hasFinancialData}
        >
          {editing ? "Cancel" : "Update"}
        </button>
      </div>

      {!editing ? (
        <div>
          <div className="metric-value" style={{ color: "var(--text-primary)" }}>
            {hasFinancialData ? `$${displayCash.toLocaleString()}` : "—"}
          </div>
          {hasFinancialData && isLiveFromBank && (
            <div style={{ marginTop: "6px" }}>
              <LiveFromBankBadge />
            </div>
          )}
          {hasFinancialData && !isLiveFromBank && lastUpdated && (
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
              Updated {lastUpdated} · {MANUAL_CASH_SUBTEXT}
            </div>
          )}
          {hasFinancialData && !isLiveFromBank && !lastUpdated && (
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
              {MANUAL_CASH_SUBTEXT}
            </div>
          )}
          {!hasFinancialData && (
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
              Add monthly financials to track cash position.
            </div>
          )}
          {hasFinancialData && !isLiveFromBank && (
          <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
              <span style={{ color: "var(--text-muted)" }}>Operating Account</span>
              <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>${Number(operating).toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
              <span style={{ color: "var(--text-muted)" }}>Reserve Account</span>
              <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>${Number(reserve).toLocaleString()}</span>
            </div>
            {Number(petty) > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                <span style={{ color: "var(--text-muted)" }}>Petty Cash</span>
                <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>${Number(petty).toLocaleString()}</span>
              </div>
            )}
          </div>
          )}
          {hasFinancialData && isLiveFromBank && (
            <div style={{ marginTop: "12px", fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.5 }}>
              Synced from connected bank accounts
              {manualCash > 0 ? ` · Manual entry ($${manualCash.toLocaleString()}) not included while bank data is live` : ""}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-[12px] text-red-400">
              {error}
            </div>
          )}
          <div>
            <div className="metric-label" style={{ marginBottom: "4px" }}>Operating Account</div>
            <input
              id="cashcard-operating"
              type="number"
              className={inputClass}
              value={operating}
              onChange={(e) => setOperating(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <div className="metric-label" style={{ marginBottom: "4px" }}>Reserve Account</div>
            <input
              id="cashcard-reserve"
              type="number"
              className={inputClass}
              value={reserve}
              onChange={(e) => setReserve(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <div className="metric-label" style={{ marginBottom: "4px" }}>Petty Cash (optional)</div>
            <input
              id="cashcard-petty"
              type="number"
              className={inputClass}
              value={petty}
              onChange={(e) => setPetty(e.target.value)}
              placeholder="0"
            />
          </div>
          <div style={{ padding: "10px", background: "var(--bg-card2)", borderRadius: "6px", fontSize: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Total Cash</span>
              <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>
                ${(Number(operating) + Number(reserve) + Number(petty)).toLocaleString()}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn-primary"
            style={{ width: "100%", padding: "8px" }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Cash Balances"}
          </button>
        </div>
      )}
    </div>
  );
}
