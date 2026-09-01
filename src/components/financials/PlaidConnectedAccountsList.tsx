import { ReadOnlyGuard } from "@/components/ui/ReadOnlyGuard";
import {
  formatPlaidAccountMask,
  formatPlaidAccountTypeLabel,
} from "@/lib/plaid-shared";

export type PlaidConnectedAccount = {
  id: string;
  plaid_connection_id: string;
  account_name: string;
  account_type: string;
  account_subtype: string | null;
  mask: string | null;
  included: boolean;
  excluded_at: string | null;
};

export function PlaidConnectedAccountsList({
  accounts,
  disabled,
  togglingAccountId,
  confirmAccountId,
  onRequestToggle,
  onCancelToggle,
  onConfirmToggle,
}: {
  accounts: PlaidConnectedAccount[];
  disabled: boolean;
  togglingAccountId: string | null;
  confirmAccountId: string | null;
  onRequestToggle: (accountId: string, included: boolean) => void;
  onCancelToggle: () => void;
  onConfirmToggle: (accountId: string, included: boolean) => void;
}) {
  if (accounts.length === 0) {
    return (
      <p className="text-[12px] text-[var(--text-secondary)] px-1">
        No accounts synced for this connection yet. Sync Now to refresh account details.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {accounts.map((account) => {
        const isToggling = togglingAccountId === account.id;
        const isConfirming = confirmAccountId === account.id;
        const nextIncluded = !account.included;

        return (
          <div key={account.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-[13px] font-semibold text-slate-100 truncate">
                    {account.account_name}
                  </div>
                  {account.included ? (
                    <span className="badge badge-green text-[10px]">Included</span>
                  ) : (
                    <span className="badge badge-amber text-[10px]">Excluded</span>
                  )}
                </div>
                <div className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                  {formatPlaidAccountMask(account.mask)}
                  {" · "}
                  {formatPlaidAccountTypeLabel(account.account_type, account.account_subtype)}
                </div>
              </div>
              {!isConfirming && (
                <ReadOnlyGuard>
                  <button
                    type="button"
                    className="btn-outline text-[12px] flex-shrink-0"
                    onClick={() => onRequestToggle(account.id, nextIncluded)}
                    disabled={disabled}
                  >
                    {account.included ? "Exclude" : "Re-include"}
                  </button>
                </ReadOnlyGuard>
              )}
            </div>

            {isConfirming && (
              <div className="mt-3 pt-3 border-t border-[var(--border)]">
                <div className="text-[13px] font-semibold text-slate-100 mb-1">
                  {account.included
                    ? "Exclude this account from Bank Import?"
                    : "Re-include this account in Bank Import?"}
                </div>
                <p className="text-[12px] text-[var(--text-secondary)]">
                  {account.included
                    ? "Its imported transactions will leave the review queue and P&L. You can re-include it later."
                    : "Its transactions will return to Bank Import. Posted amounts will be restored to P&L."}
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    className="btn-outline text-[12px]"
                    onClick={onCancelToggle}
                    disabled={isToggling}
                  >
                    Cancel
                  </button>
                  <ReadOnlyGuard>
                    <button
                      type="button"
                      className={
                        account.included
                          ? "text-[12px] px-4 py-2 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-700"
                          : "btn-primary text-[12px]"
                      }
                      onClick={() => onConfirmToggle(account.id, nextIncluded)}
                      disabled={isToggling}
                    >
                      {isToggling
                        ? account.included
                          ? "Excluding…"
                          : "Re-including…"
                        : account.included
                          ? "Exclude account"
                          : "Re-include account"}
                    </button>
                  </ReadOnlyGuard>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
