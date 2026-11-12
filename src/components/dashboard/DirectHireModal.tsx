"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { createDirectHiringOfferAction } from "@/lib/actions/hiring-offer";
import { useRouter } from "next/navigation";

interface DirectHireModalProps {
  isOpen: boolean;
  onClose: () => void;
  freelancerId: string;
  freelancerName: string;
  freelancerHourlyRate?: number | null;
  clientJobs?: Array<{ id: string; title: string; type: "FIXED" | "HOURLY"; budget?: number | null }>;
  onSuccess?: (offerId: string, conversationId?: string) => void;
}

interface MilestoneInput {
  title: string;
  amount: string;
  dueDate: string;
  description: string;
}

export function DirectHireModal({
  isOpen,
  onClose,
  freelancerId,
  freelancerName,
  freelancerHourlyRate,
  clientJobs = [],
  onSuccess,
}: DirectHireModalProps) {
  const router = useRouter();
  const [projectMode, setProjectMode] = useState<"EXISTING" | "NEW">(
    clientJobs.length > 0 ? "EXISTING" : "NEW"
  );
  const [selectedJobId, setSelectedJobId] = useState<string>(clientJobs[0]?.id || "");
  const [title, setTitle] = useState(clientJobs[0]?.title || "");
  const [description, setDescription] = useState("");
  const [paymentType, setPaymentType] = useState<"FIXED" | "HOURLY">("FIXED");
  const [amount, setAmount] = useState<string>(
    freelancerHourlyRate ? String(freelancerHourlyRate) : "500"
  );
  const [duration, setDuration] = useState("1 to 3 months");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [message, setMessage] = useState(
    `Hi ${freelancerName}, I would love to hire you directly for this project based on your expertise.`
  );
  const [milestones, setMilestones] = useState<MilestoneInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const modalRef = useRef<HTMLDivElement>(null);

  // When selected existing job changes, sync title and payment type
  const handleJobSelect = (jobId: string) => {
    setSelectedJobId(jobId);
    const found = clientJobs.find((j) => j.id === jobId);
    if (found) {
      setTitle(found.title);
      setPaymentType(found.type);
      if (found.budget) {
        setAmount(String(found.budget));
      }
    }
  };

  const addMilestone = () => {
    setMilestones((prev) => [
      ...prev,
      { title: `Milestone ${prev.length + 1}`, amount: "250", dueDate: "", description: "" },
    ]);
  };

  const removeMilestone = (index: number) => {
    setMilestones((prev) => prev.filter((_, i) => i !== index));
  };

  const updateMilestone = (index: number, field: keyof MilestoneInput, value: string) => {
    setMilestones((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    );
  };

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

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Please enter a valid rate or total budget amount.");
      return;
    }

    if (!title.trim() || title.trim().length < 3) {
      setError("Please specify a project title (minimum 3 characters).");
      return;
    }

    if (!description.trim() || description.trim().length < 10) {
      setError("Please provide a project description (minimum 10 characters).");
      return;
    }

    startTransition(async () => {
      const res = await createDirectHiringOfferAction({
        freelancerId,
        jobId: projectMode === "EXISTING" ? selectedJobId || undefined : undefined,
        title: title.trim(),
        description: description.trim(),
        type: paymentType,
        amount: parsedAmount,
        duration: duration.trim() || undefined,
        startDate: startDate || undefined,
        message: message.trim() || undefined,
        milestones:
          paymentType === "FIXED"
            ? milestones.map((m) => ({
                title: m.title.trim(),
                description: m.description.trim() || undefined,
                amount: parseFloat(m.amount) || parsedAmount,
                dueDate: m.dueDate || undefined,
              }))
            : [],
      });

      if (!res.success) {
        setError(res.error || "Failed to send hiring offer.");
        return;
      }

      if (onSuccess && res.offerId) {
        onSuccess(res.offerId, res.conversationId);
      } else if (res.conversationId) {
        router.push(`/messages?conversationId=${res.conversationId}`);
      } else {
        router.push("/dashboard/client");
      }
      onClose();
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="direct-hire-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs overflow-y-auto"
    >
      <div
        ref={modalRef}
        className="w-full max-w-2xl rounded-3xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 my-8 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h2 id="direct-hire-title" className="text-xl font-extrabold text-zinc-950 dark:text-white">
              Hire {freelancerName}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Send a direct project offer. A contract will be activated once {freelancerName} accepts.
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
          {/* Project Source Switch */}
          {clientJobs.length > 0 && (
            <div className="flex rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
              <button
                type="button"
                onClick={() => setProjectMode("EXISTING")}
                className={`flex-1 rounded-lg py-2 font-bold transition ${
                  projectMode === "EXISTING"
                    ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-700 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
                }`}
              >
                Use Existing Job ({clientJobs.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setProjectMode("NEW");
                  setTitle("");
                }}
                className={`flex-1 rounded-lg py-2 font-bold transition ${
                  projectMode === "NEW"
                    ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-700 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
                }`}
              >
                Create New Project
              </button>
            </div>
          )}

          {/* Job Select (if existing) */}
          {projectMode === "EXISTING" && clientJobs.length > 0 && (
            <div>
              <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Select Open Job
              </label>
              <select
                value={selectedJobId}
                onChange={(e) => handleJobSelect(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              >
                {clientJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title} ({j.type})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              Project Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Next.js Full Stack Platform Development"
              className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              Project Scope & Terms *
            </label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Outline project deliverables, expectations, and milestones..."
              className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Payment Type and Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Payment Model
              </label>
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value as "FIXED" | "HOURLY")}
                className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              >
                <option value="FIXED">Fixed Price Project</option>
                <option value="HOURLY">Hourly Rate Contract</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                {paymentType === "HOURLY" ? "Hourly Rate ($/hr) *" : "Total Budget ($ USD) *"}
              </label>
              <input
                type="number"
                required
                min={paymentType === "HOURLY" ? 3 : 5}
                step={paymentType === "HOURLY" ? 0.5 : 1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Duration & Start Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Estimated Duration
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              >
                <option value="Less than 1 month">Less than 1 month</option>
                <option value="1 to 3 months">1 to 3 months</option>
                <option value="3 to 6 months">3 to 6 months</option>
                <option value="More than 6 months">More than 6 months</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Optional Milestones for Fixed Price */}
          {paymentType === "FIXED" && (
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-zinc-800 dark:text-zinc-200">
                  Project Milestones (Optional)
                </span>
                <button
                  type="button"
                  onClick={addMilestone}
                  className="text-xs font-bold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
                >
                  + Add Milestone
                </button>
              </div>

              {milestones.length > 0 && (
                <div className="space-y-2 mb-3">
                  {milestones.map((m, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/40 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="text"
                          placeholder="Milestone title"
                          value={m.title}
                          onChange={(e) => updateMilestone(idx, "title", e.target.value)}
                          className="flex-1 rounded-lg border border-zinc-200 bg-white p-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                        />
                        <input
                          type="number"
                          placeholder="Amount ($)"
                          value={m.amount}
                          onChange={(e) => updateMilestone(idx, "amount", e.target.value)}
                          className="w-24 rounded-lg border border-zinc-200 bg-white p-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => removeMilestone(idx)}
                          className="text-zinc-400 hover:text-rose-600 font-bold px-1"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Message to Freelancer */}
          <div>
            <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              Direct Message to Freelancer
            </label>
            <textarea
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Action Buttons */}
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
              {isPending ? "Sending Offer..." : "Send Hiring Offer 🚀"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

