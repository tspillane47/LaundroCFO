"use client";

import { useEffect, useState } from "react";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { PlaidConnectTrustPanel } from "@/components/financials/PlaidConnectTrustPanel";
import { mapPlaidLinkSuccessAccounts, PLAID_CONNECT_TRUST } from "@/lib/plaid-shared";

export type OnboardingPlaidResult = {
  institutionName: string | null;
  /** Transactions pulled by the first sync, or null when the first sync did not finish. */
  transactionsAdded: number | null;
};

type Props = {
  storeId: string;
  result: OnboardingPlaidResult | null;
  onConnected: (result: OnboardingPlaidResult) => void;
};

async function readJson<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null;
}

/**
 * The recommended path in setup: connect a bank so real numbers show up on their own.
 * Mirrors the Financials page connect flow (trust step, link token, Plaid Link,
 * token exchange) and then runs one first sync so the user does not land on an
 * empty dashboard. Always skippable by the parent wizard.
 */
export function OnboardingPlaidConnect({ storeId, result, onConnected }: Props) {
  const [showTrust, setShowTrust] = useState(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [shouldOpen, setShouldOpen] = useState(false);
  const [working, setWorking] = useState<null | "starting" | "saving" | "syncing">(null);
  const [error, setError] = useState("");

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (publicToken, metadata: PlaidLinkOnSuccessMetadata) => {
      setError("");
      setWorking("saving");
      try {
        const exchange = await fetch("/api/plaid/exchange-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeId,
            public_token: publicToken,
            accounts: mapPlaidLinkSuccessAccounts(metadata),
          }),
        });
        const exchangePayload = await readJson<{ institution_name?: string | null; error?: string }>(
          exchange
        );
        if (!exchange.ok) {
          throw new Error(exchangePayload?.error ?? "We couldn't connect that account. Please try again.");
        }

        // The connection is saved. A failed first sync must not undo that: the
        // daily sync and the Financials page can pick it up later.
        setWorking("syncing");
        let transactionsAdded: number | null = null;
        try {
          const sync = await fetch("/api/plaid/sync-transactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storeId }),
          });
          const syncPayload = await readJson<{ added?: number }>(sync);
          if (sync.ok && typeof syncPayload?.added === "number") {
            transactionsAdded = syncPayload.added;
          }
        } catch {
          transactionsAdded = null;
        }

        onConnected({
          institutionName: exchangePayload?.institution_name ?? null,
          transactionsAdded,
        });
      } catch (connectError) {
        setError(
          connectError instanceof Error
            ? connectError.message
            : "We couldn't connect that account. Please try again."
        );
      } finally {
        setWorking(null);
        setLinkToken(null);
        setShouldOpen(false);
      }
    },
    onExit: () => {
      setWorking(null);
      setLinkToken(null);
      setShouldOpen(false);
    },
  });

  useEffect(() => {
    if (shouldOpen && linkToken && ready) {
      open();
      setShouldOpen(false);
    }
  }, [shouldOpen, linkToken, ready, open]);

  async function startConnect() {
    setShowTrust(false);
    setError("");
    setWorking("starting");
    try {
      const response = await fetch("/api/plaid/create-link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });
      const payload = await readJson<{ link_token?: string; error?: string }>(response);
      if (!response.ok || !payload?.link_token) {
        throw new Error(payload?.error ?? "We couldn't start the bank connection. Please try again.");
      }
      setLinkToken(payload.link_token);
      setShouldOpen(true);
    } catch (startError) {
      setWorking(null);
      setError(
        startError instanceof Error
          ? startError.message
          : "We couldn't start the bank connection. Please try again."
      );
    }
  }

  if (result) {
    const bank = result.institutionName?.trim() || "Your bank";
    return (
      <div
        className="rounded-xl border-2 border-green-500/60 bg-green-500/10 p-5"
        data-testid="onboarding-plaid-connected"
      >
        <div className="text-[16px] font-semibold text-[var(--text-primary)] mb-1">
          ✓ {bank} is connected
        </div>
        <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
          {result.transactionsAdded && result.transactionsAdded > 0
            ? `We pulled in ${result.transactionsAdded} transactions. Next you'll sort them into categories so your real profit and store value show up.`
            : "Your transactions are on their way. They will appear in Transactions shortly, where you can sort them into categories."}
        </p>
      </div>
    );
  }

  const busy = working !== null;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border-2 border-green-500/60 bg-green-500/10 p-5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-green-400 mb-1">
          Recommended
        </div>
        <div className="text-[18px] font-bold text-[var(--text-primary)] mb-1">
          Connect your bank account
        </div>
        <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mb-4">
          This is what makes LaundroCFO work the way it is meant to. We pull in your transactions
          automatically, so your real profit, cash, and store value show up without typing anything in.
        </p>
        <button
          type="button"
          onClick={() => setShowTrust(true)}
          disabled={busy}
          className="btn-primary w-full py-3 text-[15px] font-semibold disabled:opacity-50"
        >
          {working === "starting"
            ? "Starting…"
            : working === "saving"
              ? "Saving your connection…"
              : working === "syncing"
                ? "Pulling in your transactions…"
                : "Connect your bank"}
        </button>
        <p className="text-[11px] text-[var(--text-muted)] text-center mt-2">
          {PLAID_CONNECT_TRUST.cardHint}
        </p>
      </div>

      {showTrust && (
        <PlaidConnectTrustPanel
          busy={busy}
          onCancel={() => setShowTrust(false)}
          onContinue={() => void startConnect()}
        />
      )}

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-[12px] text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
