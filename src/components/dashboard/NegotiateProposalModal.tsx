"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { negotiateProposalRateAction } from "@/lib/actions/proposal";
import { useRouter } from "next/navigation";

interface NegotiateProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  proposalId: string;
  freelancerName: string;
  currentBidAmount: number;
  jobType: string;
  jobTitle: string;
  onSuccess?: () => void;
}

export function NegotiateProposalModal({
  isOpen,
  onClose,
  proposalId,
  freelancerName,
  currentBidAmount,
  jobType,
  jobTitle,
  onSuccess,
}: NegotiateProposalModalProps) {
  const router = useRouter();
  const isHourly = jobType.toUpperCase() === "HOURLY";
  const [proposedRate, setProposedRate] = useState<string>(String(currentBidAmount));
  const [message, setMessage] = useState(
    `Hi ${freelancerName}, I am very interested in your proposal for "${jobTitle}". I would like to propose an adjusted rate of $${currentBidAmount} to proceed with project collaboration.`
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !isPending) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
      setProposedRate(String(currentBidAmount));
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, isPending, onClose, currentBidAmount]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedRate = parseFloat(proposedRate);
    if (isNaN(parsedRate) || parsedRate <= 0) {
      setError("Please specify a valid proposed rate or budget.");
      return;
    }

    startTransition(async () => {
      const res = await negotiateProposalRateAction(
        proposalId,
        parsedRate,
        message.trim() || undefined
      );

      if (!res.success) {
        setError(res.error || "Failed to submit negotiated rate offer.");
        return;
      }

      if (onSuccess) {
        onSuccess();
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="negotiate-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs"
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h2 id="negotiate-modal-title" className="text-xl font-extrabold text-zinc-950 dark:text-white">
              Negotiate Rate with {freelancerName}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Current proposal bid:{" "}
              <strong className="text-zinc-900 dark:text-white">
                {isHourly ? `$${currentBidAmount}/hr` : `$${currentBidAmount.toLocaleString()} Fixed`}
              </strong>
            </p>
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-lg font-bold p-1 rounded-lg"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-xs">
          <div>
            <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              {isHourly ? "Proposed Hourly Rate ($/hr) *" : "Proposed Project Budget ($ USD) *"}
            </label>
            <input
              type="number"
              required
              step={isHourly ? 0.5 : 1}
              min={isHourly ? 3 : 5}
              value={proposedRate}
              onChange={(e) => setProposedRate(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              Negotiation Note / Message to Freelancer
            </label>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              disabled={isPending}
              onClick={onClose}
              className="rounded-xl border border-zinc-200 px-4 py-2.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-500 disabled:opacity-60 transition"
            >
              {isPending ? "Sending Offer..." : "Send Negotiated Offer 💬"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

