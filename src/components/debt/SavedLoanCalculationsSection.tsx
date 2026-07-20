"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase";
import { useWriteGuard } from "@/lib/useWriteGuard";
import {
  formatSavedLoanSummaryWithInputs,
  parseSavedLoanInputs,
  type SavedLoanCalculationInputs,
  type SavedLoanCalculationOutputs,
  type SavedLoanCalculationRow,
} from "@/lib/savedLoanCalculations";
import { ReadOnlyGuard } from "@/components/ui/ReadOnlyGuard";
import { useToast } from "@/components/ui/ToastProvider";

type SavedLoanCalculationsSectionProps = {
  storeId: string;
  onLoad: (inputs: SavedLoanCalculationInputs) => void;
  buildSnapshot: () => {
    inputs: SavedLoanCalculationInputs;
    outputs: SavedLoanCalculationOutputs;
  };
  compact?: boolean;
};

export function SavedLoanCalculationsSection({
  storeId,
  onLoad,
  buildSnapshot,
  compact,
}: SavedLoanCalculationsSectionProps) {
  const supabase = createClient();
  const toast = useToast();
  const { canWrite, blockedReason } = useWriteGuard();
  const [userId, setUserId] = useState<string | null>(null);
  const [savedItems, setSavedItems] = useState<SavedLoanCalculationRow[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  const loadSaved = useCallback(
    async (uid: string) => {
      const { data, error } = await supabase
        .from("saved_loan_calculations")
        .select("id, name, inputs, outputs, created_at")
        .eq("store_id", storeId)
        .eq("user_id", uid)
        .order("created_at", { ascending: false });

      if (error || !data) return;

      const rows: SavedLoanCalculationRow[] = [];
      for (const row of data) {
        const inputs = parseSavedLoanInputs(row.inputs);
        if (!inputs) continue;
        rows.push({
          id: row.id,
          name: row.name,
          inputs,
          outputs: row.outputs as SavedLoanCalculationOutputs,
          created_at: row.created_at,
        });
      }
      setSavedItems(rows);
    },
    [storeId, supabase]
  );

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      setUserId(user.id);
      await loadSaved(user.id);
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [loadSaved, supabase]);

  const openSaveDialog = () => {
    if (!canWrite) {
      toast.error(blockedReason ?? "Subscribe to make changes.");
      return;
    }
    setSaveName("");
    setSaveDialogOpen(true);
  };

  const handleSave = async () => {
    if (!canWrite) {
      toast.error(blockedReason ?? "Subscribe to make changes.");
      return;
    }
    const trimmed = saveName.trim();
    if (!trimmed) {
      toast.error("Enter a name for this calculation");
      return;
    }
    if (!userId) return;

    setSaving(true);
    try {
      const { inputs, outputs } = buildSnapshot();
      const { error } = await supabase.from("saved_loan_calculations").insert({
        store_id: storeId,
        user_id: userId,
        name: trimmed,
        inputs,
        outputs,
      });
      if (error) throw error;
      toast.success("Calculation saved");
      setSaveDialogOpen(false);
      setSaveName("");
      setExpanded(true);
      await loadSaved(userId);
    } catch {
      toast.error("Failed to save — please try again");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!canWrite) {
      toast.error(blockedReason ?? "Subscribe to make changes.");
      return;
    }
    if (!userId) return;
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

    const { error } = await supabase.from("saved_loan_calculations").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete — please try again");
      return;
    }
    await loadSaved(userId);
  };

  const handleLoad = (item: SavedLoanCalculationRow) => {
    onLoad(item.inputs);
    toast.success(`Loaded "${item.name}"`);
  };

  return (
    <div
      className={clsx(
        "rounded-xl space-y-3",
        compact ? "px-3.5 py-3" : "card"
      )}
      style={
        compact
          ? {
              background: "var(--bg-card2)",
              border: "1px solid var(--border)",
            }
          : undefined
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div
          className="text-[10px] uppercase tracking-[0.12em] font-semibold"
          style={{ color: "var(--text-muted)" }}
        >
          Saved Calculations
        </div>
        <ReadOnlyGuard>
          <button
            type="button"
            onClick={openSaveDialog}
            disabled={saving}
            className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:border-blue-500/40 hover:text-blue-400 transition-colors disabled:opacity-50"
          >
            Save
          </button>
        </ReadOnlyGuard>
      </div>

      {saveDialogOpen && (
        <div
          className="rounded-lg p-3 space-y-2.5"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          <label className="block text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
            Name this calculation
          </label>
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder='e.g. "SBA 7(a) - 1.25x DSCR"'
            maxLength={120}
            className="w-full text-[13px] px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text-primary)]"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSave();
              if (e.key === "Escape") setSaveDialogOpen(false);
            }}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSaveDialogOpen(false)}
              className="text-[11px] px-2.5 py-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
            <ReadOnlyGuard>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </ReadOnlyGuard>
          </div>
        </div>
      )}

      {savedItems.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          No saved calculations yet.
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center justify-between text-left"
          >
            <span className="text-[12px] font-medium text-[var(--text-primary)]">
              {savedItems.length} saved
            </span>
            <span className="text-[11px] text-[var(--text-secondary)]">
              {expanded ? "Collapse ▲" : "Expand ▼"}
            </span>
          </button>
          {expanded && (
            <div className="space-y-2">
              {savedItems.map((item) => (
                <SavedLoanCalculationItem
                  key={item.id}
                  item={item}
                  onLoad={() => handleLoad(item)}
                  onDelete={() => void handleDelete(item.id, item.name)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SavedLoanCalculationItem({
  item,
  onLoad,
  onDelete,
}: {
  item: SavedLoanCalculationRow;
  onLoad: () => void;
  onDelete: () => void;
}) {
  const summary = formatSavedLoanSummaryWithInputs(item.inputs, item.outputs);

  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-[var(--bg-card2)] border border-[var(--border)]">
      <div className="min-w-0">
        <div className="text-[12px] font-semibold text-[var(--text-primary)] truncate">
          {item.name}
        </div>
        <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
          {new Date(item.created_at).toLocaleDateString()} · {summary}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onLoad}
          className="text-[10px] font-medium px-2 py-1 rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:border-blue-500/40 hover:text-blue-400"
        >
          Load
        </button>
        <ReadOnlyGuard>
          <button
            type="button"
            onClick={onDelete}
            className="text-[10px] text-[var(--text-secondary)] hover:text-red-400"
          >
            Delete
          </button>
        </ReadOnlyGuard>
      </div>
    </div>
  );
}
