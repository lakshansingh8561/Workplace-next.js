"use client";

import { useState } from "react";
import { requestMilestoneChangesAction } from "@/lib/actions/contract";

interface MilestoneRevisionRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  milestoneId: string;
  milestoneTitle: string;
  onSuccess: (milestoneId: string) => void;
}

export function MilestoneRevisionRequestModal({
  isOpen,
  onClose,
  milestoneId,
  milestoneTitle,
  onSuccess,
}: MilestoneRevisionRequestModalProps) {
  const [feedback, setFeedback] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim() || feedback.trim().length < 5) {
      setError("Please provide constructive feedback of at least 5 characters.");
      return;
    }

    setIsPending(true);
    setError(null);

    try {
      const res = await requestMilestoneChangesAction({
        milestoneId,
        feedback: feedback.trim(),
      });

      if (!res.success) {
        setError(res.error || "Failed to request revisions on milestone.");
        return;
      }

      onSuccess(milestoneId);
      onClose();
    } catch (err) {
      console.error("Revision request error:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-850/50">
          <div>
            <h2 className="text-base font-extrabold text-zinc-950 dark:text-white">
              Request Milestone Changes
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Milestone: &quot;{milestoneTitle}&quot;
            </p>
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={onClose}
            className="rounded-xl p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Explain what changes, fixes, or additional work are required from the freelancer before this milestone can be approved.
          </p>

          {error && (
            <div className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
              ⚠️ {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="revisionFeedback"
              className="block text-xs font-bold text-zinc-900 dark:text-white"
            >
              Revision Feedback & Required Changes <span className="text-rose-500">*</span>
            </label>
            <textarea
              id="revisionFeedback"
              rows={4}
              required
              disabled={isPending}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="e.g. Please update the responsiveness for mobile screens and add unit tests for the checkout component..."
              className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-3.5 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition leading-relaxed resize-y"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              disabled={isPending}
              onClick={onClose}
              className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !feedback.trim()}
              className="inline-flex items-center justify-center rounded-xl bg-amber-600 px-5 py-2 text-xs font-bold text-white shadow hover:bg-amber-500 transition disabled:opacity-50 active:scale-95"
            >
              {isPending ? "Sending Request..." : "Request Changes →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

