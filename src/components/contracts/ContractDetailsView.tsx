"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createMilestoneAction,
  submitMilestoneAction,
  approveMilestoneAction,
  updateContractStatusAction,
} from "@/lib/actions/contract";
import { ContractStatus, MilestoneStatus, PaymentType } from "@prisma/client";
import { ContractReviewSection } from "@/components/contracts/ContractReviewSection";
import type { ContractReviewData } from "@/lib/actions/review";
import { FreelancerTimeTrackerWidget } from "@/components/contracts/FreelancerTimeTrackerWidget";
import { ClientWorkDiaryView } from "@/components/contracts/ClientWorkDiaryView";
import { RazorpayPaymentButton } from "@/components/payments/RazorpayCheckoutButton";
import { PaymentHistorySection } from "@/components/payments/PaymentHistorySection";
import { formatDate } from "@/lib/utils";

export interface DetailMilestone {
  id: string;
  title: string;
  description?: string | null;
  amount: number;
  dueDate?: string | null;
  status: MilestoneStatus;
  isPaid?: boolean;
  paidAt?: string | null;
  createdAt: string;
}

export interface ContractDetail {
  id: string;
  jobId: string;
  title: string;
  type: PaymentType;
  totalAmount?: number | null;
  hourlyRate?: number | null;
  terms?: string | null;
  status: ContractStatus;
  startDate: string;
  endDate?: string | null;
  clientId: string;
  freelancerId: string;
  client: {
    id: string;
    name?: string | null;
    image?: string | null;
    role?: string | null;
  };
  freelancer: {
    id: string;
    name?: string | null;
    image?: string | null;
    role?: string | null;
  };
  milestones: DetailMilestone[];
}

interface ContractDetailsViewProps {
  contract: ContractDetail;
  currentUserId: string;
  currentUserRole: "CLIENT" | "FREELANCER";
  reviewData?: ContractReviewData;
}

export function ContractDetailsView({
  contract: initialContract,
  currentUserId,
  currentUserRole,
  reviewData,
}: ContractDetailsViewProps) {
  const router = useRouter();
  const [contract, setContract] = useState<ContractDetail>(initialContract);
  const [isAddingMilestone, setIsAddingMilestone] = useState(false);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDesc, setMilestoneDesc] = useState("");
  const [milestoneAmount, setMilestoneAmount] = useState("");
  const [milestoneDueDate, setMilestoneDueDate] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [diaryRefreshKey, setDiaryRefreshKey] = useState(0);
  const [paymentRefreshTrigger, setPaymentRefreshTrigger] = useState(0);
  const [isPending, startTransition] = useTransition();

  const isClient = currentUserRole === "CLIENT" && contract.clientId === currentUserId;
  const isFreelancer =
    currentUserRole === "FREELANCER" && contract.freelancerId === currentUserId;

  const isHourly = contract.type === "HOURLY";
  const formattedAgreed = isHourly
    ? `$${contract.hourlyRate ?? 0} / hr`
    : `$${contract.totalAmount?.toLocaleString() ?? 0} Fixed`;

  // Milestone calculations
  const totalAllocated = contract.milestones.reduce((acc, m) => acc + m.amount, 0);
  const approvedTotal = contract.milestones
    .filter((m) => m.status === "APPROVED")
    .reduce((acc, m) => acc + m.amount, 0);
  const remainingBudget =
    contract.type === "FIXED" && typeof contract.totalAmount === "number"
      ? Math.max(0, contract.totalAmount - totalAllocated)
      : null;


  const handleCreateMilestone = (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setFieldErrors({});

    const parsedAmount = parseFloat(milestoneAmount);
    if (!parsedAmount || parsedAmount <= 0) {
      setFieldErrors({ amount: "Please specify a positive milestone amount" });
      return;
    }

    startTransition(async () => {
      const res = await createMilestoneAction({
        contractId: contract.id,
        title: milestoneTitle,
        description: milestoneDesc || undefined,
        amount: parsedAmount,
        dueDate: milestoneDueDate || undefined,
      });

      if (!res.success) {
        if (res.fieldErrors) setFieldErrors(res.fieldErrors);
        setActionError(res.error || "Failed to create milestone.");
        return;
      }

      // Add locally & reset form
      if (res.milestoneId) {
        const newM: DetailMilestone = {
          id: res.milestoneId,
          title: milestoneTitle,
          description: milestoneDesc || null,
          amount: parsedAmount,
          dueDate: milestoneDueDate || null,
          status: "ACTIVE",
          createdAt: new Date().toISOString(),
        };
        setContract((prev) => ({
          ...prev,
          milestones: [...prev.milestones, newM],
        }));
      }

      setIsAddingMilestone(false);
      setMilestoneTitle("");
      setMilestoneDesc("");
      setMilestoneAmount("");
      setMilestoneDueDate("");
      router.refresh();
    });
  };

  const handleSubmitMilestone = (milestoneId: string) => {
    setActionError(null);
    setActiveActionId(milestoneId);

    startTransition(async () => {
      const res = await submitMilestoneAction({ milestoneId });

      if (!res.success) {
        setActionError(res.error || "Failed to submit milestone work.");
        setActiveActionId(null);
        return;
      }

      setContract((prev) => ({
        ...prev,
        milestones: prev.milestones.map((m) =>
          m.id === milestoneId ? { ...m, status: "SUBMITTED" } : m
        ),
      }));
      setActiveActionId(null);
      router.refresh();
    });
  };

  const handleApproveMilestone = (milestoneId: string) => {
    setActionError(null);
    setActiveActionId(milestoneId);

    startTransition(async () => {
      const res = await approveMilestoneAction({ milestoneId });

      if (!res.success) {
        setActionError(res.error || "Failed to approve milestone.");
        setActiveActionId(null);
        return;
      }

      setContract((prev) => ({
        ...prev,
        milestones: prev.milestones.map((m) =>
          m.id === milestoneId ? { ...m, status: "APPROVED" } : m
        ),
      }));
      setActiveActionId(null);
      router.refresh();
    });
  };

  const handleContractStatus = (newStatus: ContractStatus) => {
    setActionError(null);
    setActiveActionId("contract_status");

    startTransition(async () => {
      const res = await updateContractStatusAction({
        contractId: contract.id,
        status: newStatus,
      });

      if (!res.success) {
        setActionError(res.error || "Failed to update contract status.");
        setActiveActionId(null);
        return;
      }

      setContract((prev) => ({
        ...prev,
        status: newStatus,
      }));
      setActiveActionId(null);
      router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Back Link */}
      <div className="mb-6">
        <Link
          href="/contracts"
          className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
        >
          ← Back to All Contracts
        </Link>
      </div>

      {/* Global Error Notice */}
      {actionError && (
        <div className="mb-6 rounded-2xl bg-red-50 p-4 border border-red-200 dark:bg-red-950/40 dark:border-red-900 text-xs font-semibold text-red-800 dark:text-red-300 flex items-center justify-between">
          <span>⚠️ {actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-700 hover:text-red-900 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Contract Header Card */}
      <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-6 border-b border-zinc-100 dark:border-zinc-800">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                Formal Contract Agreement
              </span>
              <span className="text-zinc-300 dark:text-zinc-700">•</span>
              <span className="text-zinc-500" suppressHydrationWarning>
                Effective {formatDate(contract.startDate)}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
              {contract.title}
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Contract ID: <span className="font-mono">{contract.id}</span>
            </p>
          </div>

          {/* Status Badge & Client Lifecycle Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`px-3.5 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                contract.status === "ACTIVE"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800"
                  : contract.status === "PAUSED"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400 border border-amber-300 dark:border-amber-800"
                  : contract.status === "COMPLETED"
                  ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-400 border border-blue-300 dark:border-blue-800"
                  : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-400 border border-rose-300 dark:border-rose-800"
              }`}
            >
              {contract.status}
            </span>

            <Link
              href={`/messages?contractId=${contract.id}`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <span>💬</span>
              <span>Message {isClient ? "Freelancer" : "Client"}</span>
            </Link>

            {isClient && contract.status === "ACTIVE" && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleContractStatus("PAUSED")}
                  className="rounded-xl border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 transition disabled:opacity-50"
                >
                  Pause
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleContractStatus("COMPLETED")}
                  className="rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-500 transition disabled:opacity-50"
                >
                  Complete Contract
                </button>
              </div>
            )}

            {isClient && contract.status === "PAUSED" && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleContractStatus("ACTIVE")}
                className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition disabled:opacity-50"
              >
                Resume Contract
              </button>
            )}
          </div>
        </div>

        {/* Counterparty & Agreed Terms Grid */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-2xl bg-zinc-50 p-4 border border-zinc-100 dark:bg-zinc-800/40 dark:border-zinc-800 text-xs">
          <div>
            <span className="text-zinc-500 dark:text-zinc-400 font-medium">Counterparty:</span>
            <p className="font-bold text-zinc-900 dark:text-white mt-0.5 text-sm">
              {isClient
                ? contract.freelancer.name || "Freelancer"
                : contract.client.name || "Client"}
            </p>
            <span className="text-[11px] text-zinc-400">
              {isClient ? "Assigned Freelancer" : "Project Client"}
            </span>
          </div>

          <div>
            <span className="text-zinc-500 dark:text-zinc-400 font-medium">Agreed Rate / Budget:</span>
            <p className="font-bold text-zinc-900 dark:text-white mt-0.5 text-sm">
              {formattedAgreed}
            </p>
            <span className="text-[11px] text-zinc-400 uppercase tracking-wider">
              {contract.type} Contract
            </span>
          </div>

          <div>
            <span className="text-zinc-500 dark:text-zinc-400 font-medium">Original Posting:</span>
            <p className="mt-0.5">
              <Link
                href={`/jobs/${contract.jobId}`}
                className="font-bold text-emerald-600 hover:text-emerald-500 text-sm"
              >
                View Marketplace Job →
              </Link>
            </p>
            <span className="text-[11px] text-zinc-400">
              {contract.terms || "Standard Terms"}
            </span>
          </div>
        </div>

        {/* Fixed Contract Progress Overview */}
        {!isHourly && contract.totalAmount && (
          <div className="mt-6 rounded-2xl bg-emerald-50/60 p-4 border border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
              <span className="font-bold text-emerald-900 dark:text-emerald-300">
                Milestone Budget Allocation
              </span>
              <span className="font-semibold text-emerald-800 dark:text-emerald-400">
                ${totalAllocated.toLocaleString()} of ${contract.totalAmount.toLocaleString()} allocated
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-emerald-200 dark:bg-emerald-900 overflow-hidden">
              <div
                className="h-full bg-emerald-600 transition-all duration-300"
                style={{
                  width: `${Math.min(
                    100,
                    (totalAllocated / (contract.totalAmount || 1)) * 100
                  )}%`,
                }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-emerald-700 dark:text-emerald-400">
              <span>Approved Value: ${approvedTotal.toLocaleString()}</span>
              {remainingBudget !== null && (
                <span>Remaining Unallocated: ${remainingBudget.toLocaleString()}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Hourly Contract: Freelancer Live Time Tracker Widget */}
      {isHourly && isFreelancer && contract.status === "ACTIVE" && (
        <FreelancerTimeTrackerWidget
          contractId={contract.id}
          contractTitle={contract.title}
          hourlyRate={contract.hourlyRate ?? 0}
          onSessionUpdated={() => setDiaryRefreshKey((k) => k + 1)}
        />
      )}

      {/* Hourly Contract: Client & Freelancer Work Diary & Billing Records */}
      {isHourly && (
        <ClientWorkDiaryView
          contractId={contract.id}
          contractTitle={contract.title}
          hourlyRate={contract.hourlyRate ?? 0}
          isClient={isClient}
          refreshTrigger={diaryRefreshKey}
        />
      )}

      {/* Milestones Section (For Fixed Contracts or Supplemental Hourly Checkpoints) */}
      {(!isHourly || contract.milestones.length > 0 || (isClient && contract.status === "ACTIVE")) && (
      <div className="mt-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-zinc-950 dark:text-white">
              Project Milestones
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Milestones define deliverable checkpoints and track progress throughout this project.
            </p>
          </div>

          {isClient && contract.status === "ACTIVE" && (
            <button
              type="button"
              onClick={() => setIsAddingMilestone(!isAddingMilestone)}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition active:scale-95"
            >
              {isAddingMilestone ? "Cancel" : "+ Add Milestone"}
            </button>
          )}
        </div>

        {/* Add Milestone Inline Card */}
        {isAddingMilestone && (
          <form
            onSubmit={handleCreateMilestone}
            className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-md dark:border-zinc-800 dark:bg-zinc-900 space-y-4 animate-in fade-in duration-200"
          >
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Define New Contract Milestone
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="milestoneTitle"
                  className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Milestone Title *
                </label>
                <input
                  id="milestoneTitle"
                  type="text"
                  required
                  placeholder="e.g. Phase 1: API Architecture & Schemas"
                  value={milestoneTitle}
                  onChange={(e) => setMilestoneTitle(e.target.value)}
                  disabled={isPending}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-xs font-medium text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                />
                {fieldErrors.title && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.title}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="milestoneAmount"
                  className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Amount ($) *{" "}
                  {remainingBudget !== null && (
                    <span className="text-zinc-400 font-normal">
                      (Max: ${remainingBudget.toLocaleString()})
                    </span>
                  )}
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-zinc-400">
                    $
                  </span>
                  <input
                    id="milestoneAmount"
                    type="number"
                    step="0.01"
                    min="1"
                    max={remainingBudget !== null ? remainingBudget : 1000000}
                    required
                    placeholder="250"
                    value={milestoneAmount}
                    onChange={(e) => setMilestoneAmount(e.target.value)}
                    disabled={isPending}
                    className="w-full rounded-xl border border-zinc-300 bg-white pl-7 pr-3.5 py-2 text-xs font-medium text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                  />
                </div>
                {fieldErrors.amount && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.amount}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="milestoneDueDate"
                  className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Target Due Date (Optional)
                </label>
                <input
                  id="milestoneDueDate"
                  type="date"
                  value={milestoneDueDate}
                  onChange={(e) => setMilestoneDueDate(e.target.value)}
                  disabled={isPending}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-xs font-medium text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                />
              </div>

              <div>
                <label
                  htmlFor="milestoneDesc"
                  className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Deliverable Description (Optional)
                </label>
                <input
                  id="milestoneDesc"
                  type="text"
                  placeholder="Detail deliverable specifications or acceptance criteria..."
                  value={milestoneDesc}
                  onChange={(e) => setMilestoneDesc(e.target.value)}
                  disabled={isPending}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-xs font-medium text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddingMilestone(false)}
                disabled={isPending}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || !milestoneTitle || !milestoneAmount}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition disabled:opacity-50"
              >
                {isPending ? "Creating..." : "Save Milestone"}
              </button>
            </div>
          </form>
        )}

        {/* Milestone List or Empty State */}
        {contract.milestones.length === 0 ? (
          <div className="rounded-3xl border border-zinc-200 bg-white p-10 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              No milestones have been defined yet.
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {isClient
                ? "Click '+ Add Milestone' to break down contract deliverables into verifiable checkpoints."
                : "The client will define milestones for this contract shortly."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {contract.milestones.map((milestone, idx) => {
              const isActionProcessing = isPending && activeActionId === milestone.id;

              return (
                <div
                  key={milestone.id}
                  className="rounded-3xl border border-zinc-200/90 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 transition hover:border-zinc-300 dark:hover:border-zinc-700"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Milestone Info */}
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-bold text-zinc-400">#{idx + 1}</span>
                        <span className="font-bold text-zinc-900 dark:text-white text-base">
                          {milestone.title}
                        </span>
                        {milestone.dueDate && (
                          <>
                            <span className="text-zinc-300 dark:text-zinc-700">•</span>
                            <span className="text-zinc-500" suppressHydrationWarning>
                              Due {formatDate(milestone.dueDate)}
                            </span>
                          </>
                        )}
                      </div>

                      {milestone.description && (
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                          {milestone.description}
                        </p>
                      )}

                      <p className="text-sm font-extrabold text-zinc-950 dark:text-white pt-1">
                        ${milestone.amount.toLocaleString()}
                      </p>
                    </div>

                    {/* Status Badge & Actions */}
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                          milestone.status === "APPROVED"
                            ? milestone.isPaid
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700"
                              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800"
                            : milestone.status === "SUBMITTED"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400 border border-amber-300 dark:border-amber-800"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-400 border border-blue-300 dark:border-blue-800"
                        }`}
                      >
                        {milestone.status === "APPROVED"
                          ? milestone.isPaid
                            ? "✓ Paid via Razorpay"
                            : "✓ Approved"
                          : milestone.status === "SUBMITTED"
                          ? "⏳ In Review"
                          : "● Active"}
                      </span>

                      {/* Freelancer Action: Submit Work */}
                      {isFreelancer && milestone.status === "ACTIVE" && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleSubmitMilestone(milestone.id)}
                          className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition disabled:opacity-50"
                        >
                          {isActionProcessing ? "Submitting..." : "Submit Deliverable"}
                        </button>
                      )}

                      {/* Client Action: Approve Work */}
                      {isClient && milestone.status === "SUBMITTED" && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleApproveMilestone(milestone.id)}
                          className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition disabled:opacity-50"
                        >
                          {isActionProcessing ? "Approving..." : "Approve Milestone"}
                        </button>
                      )}

                      {/* Client Action: Pay Approved Milestone with Razorpay */}
                      {milestone.status === "APPROVED" && !milestone.isPaid && isClient && (
                        <RazorpayPaymentButton
                          contractId={contract.id}
                          itemType="MILESTONE"
                          milestoneId={milestone.id}
                          amountLabel={`$${milestone.amount.toLocaleString()}`}
                          buttonLabel={`Pay Milestone ($${milestone.amount.toLocaleString()})`}
                          onPaymentSuccess={() => {
                            setContract((prev) => ({
                              ...prev,
                              milestones: prev.milestones.map((m) =>
                                m.id === milestone.id ? { ...m, isPaid: true } : m
                              ),
                            }));
                            setPaymentRefreshTrigger((prev) => prev + 1);
                          }}
                        />
                      )}

                      {/* Freelancer Notice: Approved but unpaid */}
                      {milestone.status === "APPROVED" && !milestone.isPaid && isFreelancer && (
                        <span className="text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-3 py-1 rounded-full border border-amber-200 dark:border-amber-900/50">
                          Awaiting Client Payment
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Auditable Payment & Settlement History Section */}
      <PaymentHistorySection
        contractId={contract.id}
        refreshTrigger={paymentRefreshTrigger}
      />

      {/* Contract Ratings & Reviews Section */}
      {reviewData && (
        <ContractReviewSection
          contractId={contract.id}
          contractTitle={contract.title}
          contractStatus={contract.status}
          counterpartName={
            isClient
              ? contract.freelancer.name || "Freelancer"
              : contract.client.name || "Client"
          }
          counterpartRole={isClient ? "Freelancer" : "Client"}
          initialReviewData={reviewData}
        />
      )}
    </div>
  );
}
