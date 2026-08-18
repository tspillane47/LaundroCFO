"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useStores } from "@/lib/store-context";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { formatPlaidConnectionLabel } from "@/lib/plaid-shared";

type QBConnection = {
  id: string;
  realm_id: string;
  connected_at: string;
};

type PlaidConnection = {
  id: string;
  institution_name: string | null;
  connected_at: string;
};

const INTEGRATION_META = [
  {
    id: "qbo",
    name: "QuickBooks Online",
    description: "Sync revenue, expenses, payroll, and debt service automatically each month.",
    syncs: ["Revenue", "EBITDA", "Payroll", "Utilities", "Debt Service"],
    color: "#2ca01c",
    label: "QB",
    cta: "Connect QuickBooks",
    ctaStyle: "btn-primary",
    href: "/financials?tab=quickbooks",
  },
  {
    id: "plaid",
    name: "Plaid — Bank Feed",
    description: "Connect your business bank account for real-time cash flow and transaction categorization.",
    syncs: ["Bank Transactions", "Cash Balance", "Payments"],
    color: "#1a3a5c",
    label: "PL",
    cta: "Connect Bank Account",
    ctaStyle: "btn-primary",
    href: "/financials?tab=bank",
  },
] as const;

export default function IntegrationsPage() {
  const supabase = createClient();
  const { selectedStore, loading: storesLoading } = useStores();
  const [loading, setLoading] = useState(true);
  const [qbConnection, setQbConnection] = useState<QBConnection | null>(null);
  const [plaidConnections, setPlaidConnections] = useState<PlaidConnection[]>([]);

  const loadConnections = useCallback(async () => {
    const storeId = selectedStore?.id;
    if (!storeId) {
      setQbConnection(null);
      setPlaidConnections([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const [{ data: connectionData }, { data: plaidConnectionsData }] = await Promise.all([
      supabase
        .from("quickbooks_connections")
        .select("id, realm_id, connected_at")
        .eq("store_id", storeId)
        .maybeSingle(),
      supabase
        .from("plaid_connections")
        .select("id, institution_name, connected_at")
        .eq("store_id", storeId)
        .order("connected_at", { ascending: true }),
    ]);

    setQbConnection((connectionData as QBConnection | null) ?? null);
    setPlaidConnections((plaidConnectionsData as PlaidConnection[] | null) ?? []);
    setLoading(false);
  }, [selectedStore?.id, supabase]);

  useEffect(() => {
    if (storesLoading) return;
    void loadConnections();
  }, [storesLoading, loadConnections]);

  if (storesLoading || loading) {
    return <LoadingSkeleton rows={4} />;
  }

  const hasPlaidConnections = plaidConnections.length > 0;
  const plaidConnectionLabel = hasPlaidConnections
    ? plaidConnections
        .map((connection) => formatPlaidConnectionLabel(connection.institution_name))
        .join(", ")
    : null;

  const integrations = INTEGRATION_META.map((meta) => {
    if (meta.id === "qbo") {
      return {
        ...meta,
        connected: Boolean(qbConnection),
        statusDetail: qbConnection
          ? `Connected to QuickBooks company ${qbConnection.realm_id}.`
          : meta.description,
      };
    }

    return {
      ...meta,
      connected: hasPlaidConnections,
      statusDetail: hasPlaidConnections
        ? plaidConnections.length === 1
          ? `Connected to ${plaidConnectionLabel}.`
          : `${plaidConnections.length} accounts connected: ${plaidConnectionLabel}.`
        : meta.description,
    };
  });

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-[15px] font-semibold text-slate-100">Integrations</h1>
        <p className="text-[12px] text-[var(--text-muted)] mt-1">
          Connect your data sources to automatically populate financial metrics and reduce manual entry.
        </p>
      </div>

      <div className="space-y-4">
        {integrations.map((integration) => (
          <div key={integration.id} className="card flex items-center gap-5">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-[16px] font-bold flex-shrink-0"
              style={{ background: integration.color }}
            >
              {integration.label}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <div className="text-[14px] font-semibold text-slate-100">{integration.name}</div>
                {integration.connected ? (
                  <span className="badge badge-green text-[10px]">Connected</span>
                ) : (
                  <span className="badge badge-amber text-[10px]">Not Connected</span>
                )}
              </div>
              <div className="text-[12px] text-[var(--text-secondary)] mb-2">{integration.statusDetail}</div>
              <div className="flex gap-1.5 flex-wrap">
                {integration.syncs.map((sync) => (
                  <span
                    key={sync}
                    className="text-[10px] bg-[var(--bg-page)] text-[var(--text-secondary)] px-2 py-0.5 rounded-md border border-[var(--border)] "
                  >
                    {sync}
                  </span>
                ))}
              </div>
            </div>
            <Link href={integration.href} className={`${integration.ctaStyle} flex-shrink-0 whitespace-nowrap`}>
              {integration.cta}
            </Link>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
          <span className="text-[var(--text-primary)] font-semibold">Manual entry available today.</span>{" "}
          Enter monthly financials, utilities, and lease data directly in the app, or connect QuickBooks from the
          Financials page when ready.
        </div>
      </div>
    </div>
  );
}
