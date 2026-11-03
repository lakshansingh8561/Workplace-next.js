"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { sendInterviewInvitationAction } from "@/lib/actions/invitation";

interface SendInvitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  jobTitle: string;
  freelancerId: string;
  freelancerName: string;
  onSuccess: (invitationId: string, conversationId: string) => void;
}

export function SendInvitationModal({
  isOpen,
  onClose,
  jobId,
  jobTitle,
  freelancerId,
  freelancerName,
  onSuccess,
}: SendInvitationModalProps) {
  const defaultMessage = `Hi ${freelancerName}, I reviewed your profile and proposal for "${jobTitle}" and would like to invite you for an interview to discuss the project details.`;
  const [message, setMessage] = useState(defaultMessage);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
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
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, isPending, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const trimmed = message.trim();
    if (trimmed.length < 10) {
      setError("Invitation message must be at least 10 characters.");
      return;
    }

    startTransition(async () => {
      const res = await sendInterviewInvitationAction({
        jobId,
        freelancerId,
        message: trimmed,
      });

      if (!res.success) {
        if (res.fieldErrors) {
          setFieldErrors(res.fieldErrors);
        }
        setError(res.error || "Failed to send interview invitation.");
        return;
      }

      if (res.invitationId && res.conversationId) {
        onSuccess(res.invitationId, res.conversationId);
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg overflow-hidden rounded-3xl bg-white p-6 sm:p-8 shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
      >
        <div className="flex items-start gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400 text-2xl shadow-xs">
            💬
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="invite-modal-title"
              className="text-lg sm:text-xl font-bold tracking-tight text-zinc-950 dark:text-white"
            >
              Send Interview Invitation
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Invite <span className="font-semibold text-zinc-800 dark:text-zinc-200">{freelancerName}</span> to discuss requirements before awarding the contract.
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 p-3 border border-red-200 dark:bg-red-950/40 dark:border-red-900 text-xs font-semibold text-red-700 dark:text-red-300">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="invitation-message"
              className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1"
            >
              Invitation Message
            </label>
            <textarea
              id="invitation-message"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isPending}
              maxLength={2000}
              placeholder="Explain why you'd like to interview this candidate..."
              className="w-full rounded-2xl border border-zinc-200 bg-zinc-50/60 p-3.5 text-xs text-zinc-900 placeholder-zinc-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-white dark:placeholder-zinc-500 transition resize-none disabled:opacity-50"
            />
            {fieldErrors.message && (
              <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                {fieldErrors.message}
              </p>
            )}
            <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
              <span>Minimum 10 characters</span>
              <span>{message.length} / 2000</span>
            </div>
          </div>

          <div className="rounded-2xl bg-zinc-50 p-3.5 border border-zinc-100 dark:bg-zinc-800/30 dark:border-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-400">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">Note:</span> Sending an invitation initiates a Pre-Hire conversation thread. The freelancer will have 7 days to accept or decline before the invitation expires.
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              disabled={isPending}
              onClick={onClose}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || message.trim().length < 10}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-indigo-500 transition disabled:opacity-50 active:scale-95"
            >
              {isPending ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Sending Invitation...</span>
                </>
              ) : (
                <>
                  <span>Send Interview Invitation</span>
                  <span>→</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
