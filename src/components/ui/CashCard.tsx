"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { INPUT_CLASS } from "@/components/occupancy/shared";

interface CashCardProps {
  store: any;
  onUpdate?: (updatedStore: any) => void;
}

export function CashCard({ store, onUpdate }: CashCardProps) {
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [operating, setOperating] = useState(store?.operating_account_balance ?? 0);
  const [reserve, setReserve] = useState(store?.reserve_account_balance ?? 0);
  const [petty, setPetty] = useState(store?.petty_cash ?? 0);

  const totalCash = Number(operating) + Number(reserve) + Number(petty);

  async function handleSave() {
    setSaving(true);
    const { data, error } = await supabase
      .from('stores')
      .update({
        operating_account_balance: Number(operating),
        reserve_account_balance: Number(reserve),
        petty_cash: Number(petty),
        cash_last_updated: new Date().toISOString(),
        cash_source: 'manual',
      })
      .eq('id', store.id)
      .select()
      .single();
    if (!error && data && onUpdate) onUpdate(data);
    setSaving(false);
    setEditing(false);
  }

  const inputClass = INPUT_CLASS;

  const lastUpdated = store?.cash_last_updated
    ? new Date(store.cash_last_updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div className="metric-label">Cash Position</div>
        <button
          className="btn-outline"
          style={{ fontSize: '11px', padding: '3px 10px' }}
          onClick={() => setEditing(!editing)}
        >
          {editing ? 'Cancel' : 'Update'}
        </button>
      </div>

      {!editing ? (
        <div>
          <div className="metric-value" style={{ color: 'var(--text-primary)' }}>
            ${totalCash.toLocaleString()}
          </div>
          {lastUpdated && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Updated {lastUpdated} · Manual entry
            </div>
          )}
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Operating Account</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>${Number(operating).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Reserve Account</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>${Number(reserve).toLocaleString()}</span>
            </div>
            {Number(petty) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Petty Cash</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>${Number(petty).toLocaleString()}</span>
              </div>
            )}
          </div>
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-muted)' }}>
            QuickBooks sync · Plaid integration coming soon
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <div className="metric-label" style={{ marginBottom: '4px' }}>Operating Account</div>
            <input
              type="number"
              className={inputClass}
              value={operating}
              onChange={e => setOperating(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <div className="metric-label" style={{ marginBottom: '4px' }}>Reserve Account</div>
            <input
              type="number"
              className={inputClass}
              value={reserve}
              onChange={e => setReserve(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <div className="metric-label" style={{ marginBottom: '4px' }}>Petty Cash (optional)</div>
            <input
              type="number"
              className={inputClass}
              value={petty}
              onChange={e => setPetty(e.target.value)}
              placeholder="0"
            />
          </div>
          <div style={{ padding: '10px', background: 'var(--bg-card2)', borderRadius: '6px', fontSize: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Total Cash</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                ${(Number(operating) + Number(reserve) + Number(petty)).toLocaleString()}
              </span>
            </div>
          </div>
          <button
            className="btn-primary"
            style={{ width: '100%', padding: '8px' }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Cash Balances'}
          </button>
        </div>
      )}
    </div>
  );
}
