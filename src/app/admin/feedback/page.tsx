"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { createClient } from "@/lib/supabase";
import { isAdminEmail } from "@/lib/admin";
import { FEEDBACK_TYPES } from "@/components/ui/FeedbackModal";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { PageError } from "@/components/ui/PageError";

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "wont_fix", label: "Won't Fix" },
] as const;

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const;

type FeedbackStatus = (typeof STATUS_OPTIONS)[number]["value"];
type FeedbackPriority = (typeof PRIORITY_OPTIONS)[number]["value"];

type FeedbackRow = {
  id: string;
  created_at: string | null;
  email: string | null;
  user_id: string | null;
  store_id: string | null;
  page_url: string | null;
  feedback_type: string | null;
  message: string | null;
  status: FeedbackStatus | null;
  priority: FeedbackPriority | null;
};

const EMPTY = "—";

const feedbackTypeLabels = Object.fromEntries(
  FEEDBACK_TYPES.map((item) => [item.value, item.label])
) as Record<string, string>;

function displayText(value: string | null | undefined): string {
  if (value == null || value === "") return EMPTY;
  return value;
}

function formatFeedbackType(value: string | null | undefined): string {
  if (value == null || value === "") return EMPTY;
  return feedbackTypeLabels[value] ?? value.replace(/_/g, " ");
}

function formatDate(value: string | null | undefined): string {
  if (!value) return EMPTY;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return EMPTY;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPageUrl(url: string | null): string {
  if (!url) return "—";
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}

export default function AdminFeedbackPage() {
  const router = useRouter();
  const supabase = createClient();

  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [storeNames, setStoreNames] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadFeedback = useCallback(async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !isAdminEmail(user.email)) {
        router.replace("/dashboard");
        return;
      }

      setAuthorized(true);

      const { data: feedbackData, error: feedbackError } = await supabase
        .from("feedback")
        .select("*")
        .order("created_at", { ascending: false });

      if (feedbackError) throw feedbackError;

      const feedbackRows = (feedbackData ?? []) as FeedbackRow[];
      setRows(feedbackRows);

      const storeIds = Array.from(
        new Set(
          feedbackRows
            .map((row) => row.store_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      if (storeIds.length > 0) {
        const { data: storesData, error: storesError } = await supabase
          .from("stores")
          .select("id, name")
          .in("id", storeIds);

        if (storesError) throw storesError;

        const names: Record<string, string> = {};
        for (const store of storesData ?? []) {
          names[store.id] = store.name ?? "Unnamed store";
        }
        setStoreNames(names);
      } else {
        setStoreNames({});
      }
    } catch {
      setLoadError(true);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    void loadFeedback();
  }, [loadFeedback]);

  async function updateRow(
    id: string,
    patch: Partial<Pick<FeedbackRow, "status" | "priority">>
  ) {
    setSavingId(id);
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );

    const { error } = await supabase.from("feedback").update(patch).eq("id", id);

    if (error) {
      await loadFeedback();
    }

    setSavingId(null);
  }

  const stats = useMemo(() => {
    return {
      total: rows.length,
      open: rows.filter((row) => row.status === "new" || row.status === "in_progress").length,
      urgent: rows.filter((row) => row.priority === "urgent").length,
    };
  }, [rows]);

  if (authorized === null && loading) {
    return (
      <div className="space-y-5">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (!authorized) {
    return null;
  }

  if (loadError) {
    return <PageError onRetry={loadFeedback} />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
          Feedback Admin
        </h1>
        <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>
          Review and triage user feedback submissions.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "16px",
        }}
      >
        {[
          { label: "Total", value: stats.total },
          { label: "Open", value: stats.open },
          { label: "Urgent", value: stats.urgent },
        ].map((item) => (
          <div key={item.label} className="card">
            <div className="metric-label mb-1">{item.label}</div>
            <div className="text-[24px] font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <div className="section-title mb-4">All Feedback</div>

        {loading ? (
          <CardSkeleton />
        ) : rows.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            No feedback submissions yet.
          </p>
        ) : (
          <table className="w-full text-[12px] min-w-[1100px]">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                {["Date", "Email", "Store", "Page", "Type", "Message", "Status", "Priority"].map(
                  (col) => (
                    <th
                      key={col}
                      className="text-left py-2.5 pr-3 font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {col}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b last:border-b-0 align-top"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td
                    className="py-3 pr-3 whitespace-nowrap"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {formatDate(row.created_at)}
                  </td>
                  <td className="py-3 pr-3" style={{ color: "var(--text-primary)" }}>
                    {displayText(row.email)}
                  </td>
                  <td className="py-3 pr-3" style={{ color: "var(--text-secondary)" }}>
                    {row.store_id ? storeNames[row.store_id] ?? "Unknown store" : "—"}
                  </td>
                  <td className="py-3 pr-3 max-w-[180px]">
                    {row.page_url ? (
                      <a
                        href={row.page_url}
                        className="hover:underline break-all"
                        style={{ color: "var(--accent)" }}
                        title={row.page_url}
                      >
                        {formatPageUrl(row.page_url)}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-3 pr-3 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                    {formatFeedbackType(row.feedback_type)}
                  </td>
                  <td
                    className="py-3 pr-3 max-w-[280px] whitespace-pre-wrap"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {displayText(row.message)}
                  </td>
                  <td className="py-3 pr-3">
                    <select
                      value={row.status ?? "new"}
                      onChange={(e) =>
                        void updateRow(row.id, {
                          status: e.target.value as FeedbackStatus,
                        })
                      }
                      disabled={savingId === row.id}
                      className={clsx("select-tan", "text-[12px] min-w-[120px]")}
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 pr-3">
                    <select
                      value={row.priority ?? "normal"}
                      onChange={(e) =>
                        void updateRow(row.id, {
                          priority: e.target.value as FeedbackPriority,
                        })
                      }
                      disabled={savingId === row.id}
                      className={clsx("select-tan", "text-[12px] min-w-[100px]")}
                    >
                      {PRIORITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
