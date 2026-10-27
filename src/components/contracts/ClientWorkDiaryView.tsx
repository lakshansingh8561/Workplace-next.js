"use client";

import { useState, useEffect } from "react";
import {
  getContractWorkDiaryAction,
  submitTimeEntriesAction,
  approveTimeEntriesAction,
  disputeTimeEntriesAction,
  ContractWorkDiaryResult,
  DailySummary,
  WorkDiaryEntry,
  WorkDiaryScreenshot,
} from "@/lib/actions/time-tracker";
import { TimeTrackingStatus, TimesheetReviewStatus } from "@prisma/client";
import { RazorpayPaymentButton } from "@/components/payments/RazorpayCheckoutButton";

interface ClientWorkDiaryViewProps {
  contractId: string;
  contractTitle?: string;
  hourlyRate: number;
  isClient: boolean;
  refreshTrigger?: number;
}

export function ClientWorkDiaryView({
  contractId,
  contractTitle,
  hourlyRate,
  isClient,
  refreshTrigger = 0,
}: ClientWorkDiaryViewProps) {
  const [diaryData, setDiaryData] = useState<ContractWorkDiaryResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<WorkDiaryScreenshot | null>(null);

  useEffect(() => {
    let ignore = false;
    async function loadWorkDiary() {
      try {
        const res = await getContractWorkDiaryAction(contractId);
        if (!ignore) {
          if (!res.success) {
            setError(res.error || "Failed to load contract work diary.");
          } else {
            setDiaryData(res);
          }
        }
      } catch (err) {
        if (!ignore) {
          console.error("Error loading work diary:", err);
          setError("An unexpected error occurred while loading the work diary.");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadWorkDiary();
    return () => {
      ignore = true;
    };
  }, [contractId, refreshTrigger]);

  const handleManualRefresh = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getContractWorkDiaryAction(contractId);
      if (!res.success) {
        setError(res.error || "Failed to load contract work diary.");
      } else {
        setDiaryData(res);
      }
    } catch (err) {
      console.error("Error loading work diary:", err);
      setError("An unexpected error occurred while loading the work diary.");
    } finally {
      setIsLoading(false);
    }
  };

  const weeklySummary = diaryData?.weeklySummary;
  const dailySummaries: DailySummary[] = diaryData?.dailySummaries || [];

  return (
    <div className="space-y-8">
      {/* Work Diary Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-zinc-950 dark:text-white">
              Contract Work Diary & Billing Records
            </h2>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
              ${hourlyRate}/hr
            </span>
          </div>
          {contractTitle && (
            <p className="mt-0.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              Contract: {contractTitle}
            </p>
          )}
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {isClient
              ? "Review tracked hours, recorded activity snapshots, and calculated billing totals for your hired freelancer."
              : "Review your submitted work sessions, activity logs, and calculated billing breakdown."}
          </p>
        </div>

        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 transition active:scale-95 disabled:opacity-50"
        >
          🔄 {isLoading ? "Refreshing..." : "Refresh Records"}
        </button>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          ⚠️ {error}
        </div>
      )}

      {/* Calculated Billing Summary Cards */}
      {weeklySummary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Total Logged Time
            </span>
            <div className="mt-2 text-2xl font-bold text-zinc-950 dark:text-white">
              {weeklySummary.totalHours} <span className="text-sm font-medium text-zinc-500">hrs</span>
            </div>
            <span className="text-[11px] text-zinc-400">
              ${weeklySummary.totalBillableAmount.toFixed(2)} total value across {weeklySummary.sessionCount} sessions
            </span>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/20">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-800 dark:text-blue-400">
              Pending Review
            </span>
            <div className="mt-2 text-2xl font-bold text-blue-700 dark:text-blue-300">
              ${weeklySummary.pendingAmount?.toFixed(2) ?? "0.00"}
            </div>
            <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">
              {weeklySummary.pendingHours ?? 0} hrs awaiting approval
            </span>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
              Approved Billable
            </span>
            <div className="mt-2 text-2xl font-bold text-emerald-700 dark:text-emerald-300">
              ${weeklySummary.approvedAmount?.toFixed(2) ?? "0.00"}
            </div>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
              {weeklySummary.approvedHours ?? 0} hrs approved by client
            </span>
          </div>

          <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-5 shadow-sm dark:border-rose-900/50 dark:bg-rose-950/20">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-800 dark:text-rose-400">
              Disputed Hours
            </span>
            <div className="mt-2 text-2xl font-bold text-rose-700 dark:text-rose-300">
              ${weeklySummary.disputedAmount?.toFixed(2) ?? "0.00"}
            </div>
            <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
              {weeklySummary.disputedHours ?? 0} hrs disputed
            </span>
          </div>
        </div>
      )}

      {/* Gateway Status Banner */}
      <div className="rounded-2xl bg-emerald-50/70 p-4 border border-emerald-200/80 dark:bg-emerald-950/20 dark:border-emerald-900/40 text-xs text-emerald-900 dark:text-emerald-300 flex items-start gap-2.5">
        <span className="text-base leading-none">💳</span>
        <div>
          <strong className="font-semibold">Razorpay Payment Integration:</strong> Timesheet billing amounts are calculated on the server from validated time logs. Approved hours can be paid immediately using Razorpay Checkout. Merchant transaction receipts and audit signatures are recorded directly in the contract payment log.
        </div>
      </div>

      {/* Storage Status Notice Banner */}
      {diaryData && !diaryData.isStorageConfigured && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300 flex items-start gap-2.5">
          <span className="text-base leading-none">ℹ️</span>
          <div>
            <strong className="font-semibold">Screenshot Storage Notice:</strong> Private cloud storage (Cloudinary / S3 / R2) is not currently configured. Work session hours, calculated billing, keystrokes, mouse activity, and task memos are fully preserved and audited, but interval screenshot preview images cannot be persisted to server storage.
          </div>
        </div>
      )}

      {/* Bulk Payment Card for Client if approved unpaid entries exist */}
      {(() => {
        const allEntries = diaryData?.entries || [];
        const approvedUnpaid = allEntries.filter(
          (e) =>
            e.status === TimeTrackingStatus.STOPPED &&
            e.reviewStatus === TimesheetReviewStatus.APPROVED &&
            !e.isPaid
        );
        const unpaidTotal = Number(
          approvedUnpaid.reduce((sum, e) => sum + e.billableAmount, 0).toFixed(2)
        );

        if (!isClient || approvedUnpaid.length === 0) return null;

        return (
          <div className="rounded-3xl border border-emerald-300 bg-gradient-to-r from-emerald-50/90 to-teal-50/90 p-6 shadow-sm dark:border-emerald-800 dark:from-emerald-950/40 dark:to-teal-950/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                Approved Timesheets Ready for Settlement
              </span>
              <h4 className="text-base font-bold text-zinc-950 dark:text-white">
                {approvedUnpaid.length} approved session{approvedUnpaid.length === 1 ? "" : "s"} totaling ${unpaidTotal.toFixed(2)}
              </h4>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                You can settle all approved unpaid sessions in one transaction through Razorpay Checkout.
              </p>
            </div>
            <RazorpayPaymentButton
              contractId={contractId}
              itemType="HOURLY_TIMESHEET"
              timeEntryIds={approvedUnpaid.map((e) => e.id)}
              amountLabel={`$${unpaidTotal.toFixed(2)}`}
              buttonLabel={`Pay All Approved Hours ($${unpaidTotal.toFixed(2)})`}
              onPaymentSuccess={handleManualRefresh}
            />
          </div>
        );
      })()}

      {/* Daily Grouped Sessions Breakdown */}
      {isLoading ? (
        <div className="rounded-3xl border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 animate-pulse">
          Loading work diary records...
        </div>
      ) : dailySummaries.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-3xl mb-2">⏱️</div>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
            No Time Entries Recorded Yet
          </h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
            {isClient
              ? "Your freelancer has not recorded time sessions on this contract yet. Work sessions and activity summaries will appear here in real-time."
              : "Use the Hourly Time Tracker widget above to start tracking your work on this project."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {dailySummaries.map((day) => (
            <div
              key={day.date}
              className="rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden"
            >
              {/* Day Header */}
              <div className="bg-zinc-50 px-6 py-4 border-b border-zinc-200 dark:bg-zinc-800/50 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                    {day.formattedDate}
                  </h4>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {day.entries.length} session{day.entries.length === 1 ? "" : "s"} logged
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <span className="text-zinc-600 dark:text-zinc-300">
                    Day Total: <strong className="text-zinc-900 dark:text-white">{day.totalHours} hrs</strong>
                  </span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                    ${day.totalBillableAmount.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Sessions List */}
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {day.entries.map((entry) => (
                  <SessionRow
                    key={entry.id}
                    entry={entry}
                    contractId={contractId}
                    isClient={isClient}
                    isStorageConfigured={diaryData?.isStorageConfigured}
                    onViewSnapshot={(s) => setSelectedSnapshot(s)}
                    onActionDone={handleManualRefresh}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Snapshot Modal */}
      {selectedSnapshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl rounded-3xl border border-zinc-800 bg-zinc-950 p-6 text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-emerald-400">
                  Work Activity Snapshot
                </h3>
                <span className="text-xs text-zinc-400" suppressHydrationWarning>
                  Recorded at {new Date(selectedSnapshot.timestamp).toLocaleTimeString()} (
                  {new Date(selectedSnapshot.timestamp).toLocaleDateString()})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSnapshot(null)}
                className="rounded-lg bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
              >
                ✕ Close
              </button>
            </div>

            {selectedSnapshot.imageUrl ? (
              <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedSnapshot.imageUrl}
                  alt="Work activity frame"
                  className="w-full max-h-[400px] object-contain"
                />
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-8 text-center space-y-2">
                <div className="text-3xl">📊</div>
                <h4 className="text-xs font-bold text-zinc-200">
                  Activity Metrics Recorded (No Screenshot Saved)
                </h4>
                <p className="text-xs text-zinc-400 max-w-md mx-auto">
                  {!diaryData?.isStorageConfigured
                    ? "Private cloud storage (Cloudinary / S3 / R2) is not configured in this environment. Activity metrics (activity score, keystrokes, mouse events) were recorded securely, but screenshot image frames cannot be persisted to server storage."
                    : "Screen sharing was not active or permission was not granted by the freelancer when this interval snapshot was taken. Activity metrics were recorded without a screen capture frame."}
                </p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              <div className="rounded-xl bg-zinc-900 p-3">
                <span className="text-zinc-500">Activity Rating</span>
                <div className="mt-1 font-bold text-emerald-400">
                  {selectedSnapshot.activityScore}%
                </div>
              </div>
              <div className="rounded-xl bg-zinc-900 p-3">
                <span className="text-zinc-500">Keystrokes</span>
                <div className="mt-1 font-bold text-zinc-200">
                  {selectedSnapshot.keystrokes}
                </div>
              </div>
              <div className="rounded-xl bg-zinc-900 p-3">
                <span className="text-zinc-500">Mouse Events</span>
                <div className="mt-1 font-bold text-zinc-200">
                  {selectedSnapshot.mouseEvents}
                </div>
              </div>
            </div>

            {selectedSnapshot.memo && (
              <div className="rounded-xl bg-zinc-900 p-3 text-xs text-zinc-300">
                <span className="font-semibold text-zinc-400">Memo: </span>
                {selectedSnapshot.memo}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Subcomponent: Individual Session Row
function SessionRow({
  entry,
  contractId,
  isClient,
  isStorageConfigured = false,
  onViewSnapshot,
  onActionDone,
}: {
  entry: WorkDiaryEntry;
  contractId: string;
  isClient: boolean;
  isStorageConfigured?: boolean;
  onViewSnapshot: (s: WorkDiaryScreenshot) => void;
  onActionDone?: () => void;
}) {
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [isDisputing, setIsDisputing] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formatTimeOnly = (isoString?: string | null) => {
    if (!isoString) return "In Progress";
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatSecondsToReadable = (sec: number) => {
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    if (hours === 0 && minutes === 0) return `${sec}s`;
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
  };

  const handleSubmitForReview = async () => {
    setActionError(null);
    setIsSubmitting(true);
    try {
      const res = await submitTimeEntriesAction({
        contractId,
        timeEntryIds: [entry.id],
      });
      if (res.success) {
        onActionDone?.();
      } else {
        setActionError(res.error || "Failed to submit timesheet.");
      }
    } catch {
      setActionError("Error submitting timesheet.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async () => {
    setActionError(null);
    setIsSubmitting(true);
    try {
      const res = await approveTimeEntriesAction({
        contractId,
        timeEntryIds: [entry.id],
      });
      if (res.success) {
        onActionDone?.();
      } else {
        setActionError(res.error || "Failed to approve timesheet.");
      }
    } catch {
      setActionError("Error approving timesheet.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDispute = async () => {
    if (!disputeReason.trim() || disputeReason.trim().length < 5) {
      setActionError("Please provide a dispute reason of at least 5 characters.");
      return;
    }
    setActionError(null);
    setIsSubmitting(true);
    try {
      const res = await disputeTimeEntriesAction({
        contractId,
        timeEntryIds: [entry.id],
        reason: disputeReason.trim(),
      });
      if (res.success) {
        setIsDisputing(false);
        setDisputeReason("");
        onActionDone?.();
      } else {
        setActionError(res.error || "Failed to dispute timesheet.");
      }
    } catch {
      setActionError("Error disputing timesheet.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-5 hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30 transition space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="font-mono text-xs font-bold text-zinc-900 dark:text-white"
              suppressHydrationWarning
            >
              {formatTimeOnly(entry.startTime)} — {formatTimeOnly(entry.endTime)}
            </span>

            {/* Tracking Status */}
            {entry.status === TimeTrackingStatus.RECORDING && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                ● Live
              </span>
            )}
            {entry.status === TimeTrackingStatus.PAUSED && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                Paused
              </span>
            )}
            {entry.status === TimeTrackingStatus.STOPPED && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                Completed
              </span>
            )}

            {/* Timesheet Approval Status */}
            {entry.status === TimeTrackingStatus.STOPPED && (
              <>
                {entry.reviewStatus === TimesheetReviewStatus.DRAFT && (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                    Draft Timesheet
                  </span>
                )}
                {entry.reviewStatus === TimesheetReviewStatus.SUBMITTED && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    Submitted for Review
                  </span>
                )}
                {entry.reviewStatus === TimesheetReviewStatus.APPROVED && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                      entry.isPaid
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700"
                        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                    }`}
                  >
                    {entry.isPaid ? "✓ Paid via Razorpay" : "✓ Approved"}
                  </span>
                )}
                {entry.reviewStatus === TimesheetReviewStatus.DISPUTED && (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                    ⚠️ Disputed
                  </span>
                )}
              </>
            )}
          </div>

          <p className="text-xs text-zinc-700 dark:text-zinc-300">
            {entry.description || <span className="italic text-zinc-400">No task memo provided</span>}
          </p>

          {entry.disputeReason && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-2 text-[11px] text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-300">
              <strong className="font-semibold">Dispute Note:</strong> {entry.disputeReason}
            </div>
          )}

          {actionError && (
            <div className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
              ⚠️ {actionError}
            </div>
          )}
        </div>

        {/* Calculation summary & Action Buttons */}
        <div className="text-right space-y-2">
          <div>
            <div className="text-sm font-bold text-zinc-950 dark:text-white">
              {formatSecondsToReadable(entry.durationSeconds)}{" "}
              <span className="text-xs font-medium text-zinc-500">
                ({(entry.durationSeconds / 3600).toFixed(2)}h)
              </span>
            </div>
            <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              ${entry.billableAmount.toFixed(2)}{" "}
              <span className="text-[10px] font-normal text-zinc-400">
                @ ${entry.hourlyRate}/hr
              </span>
            </div>
          </div>

          {/* Interactive Timesheet Workflow Controls */}
          {entry.status === TimeTrackingStatus.STOPPED && (
            <div className="flex items-center justify-end gap-2 pt-1">
              {/* Freelancer Action: Submit Draft/Disputed */}
              {!isClient && (entry.reviewStatus === TimesheetReviewStatus.DRAFT || entry.reviewStatus === TimesheetReviewStatus.DISPUTED) && (
                <button
                  type="button"
                  onClick={handleSubmitForReview}
                  disabled={isSubmitting}
                  className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-xs hover:bg-blue-500 transition disabled:opacity-50"
                >
                  {isSubmitting ? "Submitting..." : "Submit for Client Review"}
                </button>
              )}

              {/* Client Actions: Approve / Dispute Submitted */}
              {isClient && entry.reviewStatus === TimesheetReviewStatus.SUBMITTED && (
                <>
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={isSubmitting}
                    className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500 transition disabled:opacity-50"
                  >
                    {isSubmitting ? "Approving..." : "✓ Approve"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsDisputing(!isDisputing)}
                    disabled={isSubmitting}
                    className="rounded-lg border border-rose-300 bg-white px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:bg-zinc-900 dark:text-rose-400 transition disabled:opacity-50"
                  >
                    {isDisputing ? "Cancel" : "Dispute"}
                  </button>
                </>
              )}

              {/* Payment Actions for Approved Entries */}
              {entry.reviewStatus === TimesheetReviewStatus.APPROVED && !entry.isPaid && (
                <>
                  {isClient ? (
                    <RazorpayPaymentButton
                      contractId={contractId}
                      itemType="HOURLY_TIMESHEET"
                      timeEntryIds={[entry.id]}
                      amountLabel={`$${entry.billableAmount.toFixed(2)}`}
                      buttonLabel={`Pay ($${entry.billableAmount.toFixed(2)})`}
                      variant="compact"
                      onPaymentSuccess={onActionDone}
                    />
                  ) : (
                    <span className="rounded-md bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50">
                      Awaiting Payment
                    </span>
                  )}
                </>
              )}
            </div>
          )}

          {/* Inline Dispute Input */}
          {isDisputing && (
            <div className="mt-2 space-y-2 text-left bg-zinc-50 dark:bg-zinc-800/60 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700">
              <label htmlFor={`dispute-input-${entry.id}`} className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                Reason for Disputing Session:
              </label>
              <textarea
                id={`dispute-input-${entry.id}`}
                rows={2}
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="e.g. Unrelated activity recorded or idle period exceeding agreed thresholds..."
                className="w-full text-xs rounded-lg border border-zinc-300 p-2 bg-white text-zinc-900 dark:bg-zinc-900 dark:border-zinc-700 dark:text-white"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDisputing(false)}
                  className="rounded-lg px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDispute}
                  disabled={isSubmitting || disputeReason.trim().length < 5}
                  className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                >
                  Confirm Dispute
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Snapshots Toggle */}
      {entry.screenshots && entry.screenshots.length > 0 && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowSnapshots(!showSnapshots)}
            className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 inline-flex items-center gap-1"
          >
            📸 {showSnapshots ? "Hide" : "View"} {entry.screenshots.length} Interval Snapshot
            {entry.screenshots.length === 1 ? "" : "s"}
          </button>

          {showSnapshots && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 animate-in fade-in">
              {entry.screenshots.map((s, idx) => (
                <div
                  key={s.id}
                  onClick={() => onViewSnapshot(s)}
                  className="group cursor-pointer rounded-xl border border-zinc-200 bg-white p-2 text-center shadow-xs hover:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 transition"
                >
                  <div className="aspect-video w-full rounded-lg bg-zinc-100 dark:bg-zinc-800/80 flex items-center justify-center text-xs overflow-hidden border border-zinc-200 dark:border-zinc-700/60">
                    {s.imageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={s.imageUrl}
                        alt={`Snapshot ${idx + 1}`}
                        className="h-full w-full object-cover group-hover:scale-105 transition"
                      />
                    ) : (
                      <div className="p-1 flex flex-col items-center justify-center text-center">
                        <span className="text-xs leading-none">📊</span>
                        <span className="text-[9px] font-semibold text-zinc-600 dark:text-zinc-300 mt-1 leading-tight">
                          Activity Log
                        </span>
                        <span className="text-[8px] text-zinc-400 dark:text-zinc-500 leading-none">
                          {!isStorageConfigured ? "Storage Unset" : "No Screen"}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mt-1 text-[10px] font-mono text-zinc-500">
                    {formatTimeOnly(s.timestamp)}
                  </div>
                  <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {s.activityScore}% act.
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
