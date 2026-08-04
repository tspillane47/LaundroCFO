"use client";

import { useCallback, useEffect, useState } from "react";
import { FormBanner } from "@/components/ui/FormBanner";
import { INPUT_CLASS } from "@/components/occupancy/shared";

type StoreMember = {
  user_id: string;
  email: string;
  added_at: string;
};

type ManageAccessSectionProps = {
  storeId: string;
};

function formatAddedDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ManageAccessSection({ storeId }: ManageAccessSectionProps) {
  const [members, setMembers] = useState<StoreMember[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/stores/${storeId}/members`);
      if (!res.ok) {
        setMessage({ type: "error", text: "Failed to load co-owners." });
        return;
      }
      const data = (await res.json()) as { members: StoreMember[]; isOwner: boolean };
      setMembers(data.members);
      setIsOwner(data.isOwner);
    } catch {
      setMessage({ type: "error", text: "Failed to load co-owners." });
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (!message || message.type !== "success") return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || adding) return;

    setAdding(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/stores/${storeId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        member?: StoreMember;
      };

      if (!res.ok) {
        setMessage({
          type: "error",
          text: data.message ?? data.error ?? "Failed to add co-owner.",
        });
        return;
      }

      if (data.member) {
        setMembers((prev) => [...prev, data.member!]);
      } else {
        await loadMembers();
      }
      setEmail("");
      setMessage({ type: "success", text: `${trimmed} now has access to this store.` });
    } catch {
      setMessage({ type: "error", text: "Failed to add co-owner." });
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(member: StoreMember) {
    const confirmed = window.confirm(
      `Remove ${member.email} from this store? They will lose access immediately.`
    );
    if (!confirmed || removingId) return;

    setRemovingId(member.user_id);
    setMessage(null);

    try {
      const res = await fetch(`/api/stores/${storeId}/members/${member.user_id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "Failed to remove co-owner." });
        return;
      }

      setMembers((prev) => prev.filter((m) => m.user_id !== member.user_id));
      setMessage({ type: "success", text: `${member.email} has been removed.` });
    } catch {
      setMessage({ type: "error", text: "Failed to remove co-owner." });
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="card">
      <div className="section-title">Manage Access</div>
      <p className="text-[12px] mb-3" style={{ color: "var(--text-muted)" }}>
        {isOwner
          ? "Invite co-owners to view and manage this store. They need a LaundroCFO account first."
          : "People with access to this store."}
      </p>

      <FormBanner message={message} />

      {loading ? (
        <p className="text-[13px] text-[var(--text-muted)] py-2">Loading…</p>
      ) : members.length === 0 ? (
        <p className="text-[13px] text-[var(--text-muted)] py-2">
          {isOwner ? "No co-owners yet." : "Only the store owner has access."}
        </p>
      ) : (
        <div className="divide-y divide-white/[0.04] mb-4">
          {members.map((member) => (
            <div
              key={member.user_id}
              className="flex items-center justify-between gap-3 py-2.5 text-[13px]"
            >
              <div className="min-w-0">
                <div className="font-semibold text-slate-100 truncate">{member.email}</div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  Added {formatAddedDate(member.added_at)}
                </div>
              </div>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => handleRemove(member)}
                  disabled={removingId === member.user_id}
                  className="text-[12px] text-red-400 hover:text-red-300 disabled:opacity-40 shrink-0"
                >
                  {removingId === member.user_id ? "Removing…" : "Remove"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {isOwner && (
        <form onSubmit={handleAdd} className="space-y-3 pt-1">
          <div>
            <div className="metric-label mb-1.5">Add Co-Owner</div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT_CLASS}
              placeholder="partner@example.com"
              required
              disabled={adding}
            />
          </div>
          <button
            type="submit"
            disabled={adding || !email.trim()}
            className="btn-primary w-full py-2.5 text-[13px] disabled:opacity-40"
          >
            {adding ? "Adding…" : "Add Co-Owner"}
          </button>
        </form>
      )}
    </div>
  );
}
