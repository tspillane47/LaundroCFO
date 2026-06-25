"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { createClient } from "@/lib/supabase";
import { useStores } from "@/lib/store-context";
import { INPUT_CLASS } from "@/components/occupancy/shared";

export const FEEDBACK_TYPES = [
  { value: "bug", label: "Bug" },
  { value: "feature_request", label: "Feature Request" },
  { value: "confusing", label: "Confusing / Hard to Use" },
  { value: "financial_calculation", label: "Financial Calculation Issue" },
  { value: "other", label: "Other" },
] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number]["value"];

type FeedbackModalProps = {
  open: boolean;
  onClose: () => void;
};

export function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const supabase = createClient();
  const pathname = usePathname();
  const { selectedStore, isAllStores } = useStores();

  const [feedbackType, setFeedbackType] = useState<FeedbackType>("bug");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setFeedbackType("bug");
      setMessage("");
      setError("");
      setSubmitting(false);
      setSubmitted(false);
    }
  }, [open]);

  useEffect(() => {
    if (!submitted) return;
    const timer = setTimeout(() => {
      onClose();
    }, 1500);
    return () => clearTimeout(timer);
  }, [submitted, onClose]);

  if (!open) return null;

  async function handleSubmit() {
    const trimmed = message.trim();
    if (!trimmed) {
      setError("Please enter a message.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("You must be signed in to submit feedback.");
        setSubmitting(false);
        return;
      }

      const pageUrl =
        typeof window !== "undefined" ? window.location.href : pathname;

      const { error: insertError } = await supabase.from("feedback").insert({
        user_id: user.id,
        email: user.email ?? null,
        store_id: !isAllStores && selectedStore?.id ? selectedStore.id : null,
        page_url: pageUrl,
        feedback_type: feedbackType,
        message: trimmed,
        status: "new",
        priority: "normal",
      });

      if (insertError) throw insertError;

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit feedback.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => {
        if (!submitting && !submitted) onClose();
      }}
    >
      <div
        className="card max-w-md w-full space-y-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
      >
        {submitted ? (
          <div className="py-6 text-center">
            <div
              className="text-[15px] font-semibold mb-1"
              style={{ color: "var(--text-primary)" }}
            >
              Thank you for your feedback!
            </div>
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              We appreciate you helping us improve LaundroCFO.
            </p>
          </div>
        ) : (
          <>
            <div>
              <div
                id="feedback-modal-title"
                className="text-[15px] font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Send Feedback
              </div>
              <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>
                Report bugs, request features, or tell us what&apos;s confusing.
              </p>
            </div>

            <div>
              <label
                htmlFor="feedback-type"
                className="text-[12px] block mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Feedback type
              </label>
              <select
                id="feedback-type"
                value={feedbackType}
                onChange={(e) => setFeedbackType(e.target.value as FeedbackType)}
                className={clsx("select-tan", "w-full text-[12px]")}
                disabled={submitting}
              >
                {FEEDBACK_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="feedback-message"
                className="text-[12px] block mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Message
              </label>
              <textarea
                id="feedback-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                className={clsx(INPUT_CLASS, "w-full resize-y min-h-[120px]")}
                placeholder="Describe what happened or what you'd like to see..."
                disabled={submitting}
                autoFocus
              />
            </div>

            {error && (
              <div
                className="rounded-lg p-3 text-[12px]"
                style={{
                  background: "var(--bg-danger-tint)",
                  color: "var(--text-danger)",
                }}
              >
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn-outline"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleSubmit()}
                disabled={submitting || !message.trim()}
              >
                {submitting ? "Submitting…" : "Submit Feedback"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
