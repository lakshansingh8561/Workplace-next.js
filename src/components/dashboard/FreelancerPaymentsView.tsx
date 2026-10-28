"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FreelancerPaymentItemDTO,
  FreelancerPaymentsSummary,
} from "@/lib/actions/payment";
import { formatDate } from "@/lib/utils";

interface FreelancerPaymentsViewProps {
  payments: FreelancerPaymentItemDTO[];
  summary: FreelancerPaymentsSummary;
  totalPayments: number;
  currentPage: number;
  totalPages: number;
  currentStatus: string;
  currentType: string;
  searchQuery: string;
}

export function FreelancerPaymentsView({
  payments,
  summary,
  totalPayments,
  currentPage,
  totalPages,
  currentStatus,
  currentType,
  searchQuery,
}: FreelancerPaymentsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchQuery);
  const [selectedPayment, setSelectedPayment] = useState<FreelancerPaymentItemDTO | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleFilterChange = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "ALL" || !value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.set("page", "1");
    router.push(`/dashboard/freelancer/payments?${params.toString()}`);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (searchTerm.trim()) {
      params.set("search", searchTerm.trim());
    } else {
      params.delete("search");
    }
    params.set("page", "1");
    router.push(`/dashboard/freelancer/payments?${params.toString()}`);
  };

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    router.push(`/dashboard/freelancer/payments?${params.toString()}`);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const statusTabs = [
    { id: "ALL", label: "All Transactions", count: summary.totalTransactions },
    { id: "SUCCESS", label: "Settled", count: summary.settledCount },
    { id: "PENDING", label: "Pending", count: summary.pendingCount },
    { id: "FAILED", label: "Failed", count: summary.failedCount },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-zinc-200/80 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
              Earnings & Client Payments
            </h1>
            <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
              USD Ledger
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            Track verified client payments, approved milestones, timesheets, and transaction settlement audit trails.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/contracts"
            className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-bold text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 transition active:scale-95"
          >
            📑 Active Contracts
          </Link>
          <Link
            href="/dashboard/freelancer/proposals"
            className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-bold text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 transition active:scale-95"
          >
            📋 My Proposals
          </Link>
        </div>
      </div>

      {/* Honest Architectural Disclosure Notice */}
      <div className="mt-6 rounded-2xl border border-blue-200/70 bg-blue-50/60 p-4 sm:p-5 dark:border-blue-900/50 dark:bg-blue-950/20">
        <div className="flex items-start gap-3.5">
          <span className="text-xl shrink-0 mt-0.5">ℹ️</span>
          <div className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
            <strong className="font-bold">Platform Merchant Ingestion Disclosure:</strong>{" "}
            Client payments recorded here represent verified funds collected on your behalf via Razorpay for approved deliverables. 
            Automated split payouts to external bank accounts are currently in development; recorded amounts reflect verified client settlements within WorkPulse.
          </div>
        </div>
      </div>

      {/* Key Metric Cards */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Settled Earnings */}
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              Total Settled Earnings
            </span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              Verified
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-950 dark:text-white">
              ${summary.totalEarnings.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              {summary.currency}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            From {summary.settledCount} paid deliverable{summary.settledCount === 1 ? "" : "s"}
          </p>
        </div>

        {/* Pending Clearance */}
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              Pending Clearance
            </span>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
              In Gateway
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black tracking-tight text-amber-600 dark:text-amber-400">
              ${summary.pendingAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              {summary.currency}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            {summary.pendingCount} order{summary.pendingCount === 1 ? "" : "s"} awaiting capture
          </p>
        </div>

        {/* Settled Deliverables */}
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              Settled Transactions
            </span>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              Completed
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-950 dark:text-white">
              {summary.settledCount}
            </span>
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              Items
            </span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            Across active & completed contracts
          </p>
        </div>

        {/* Average Transaction */}
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              Avg. Transaction
            </span>
            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
              Per Order
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-950 dark:text-white">
              ${summary.settledCount > 0
                ? (summary.totalEarnings / summary.settledCount).toFixed(2)
                : "0.00"}
            </span>
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              {summary.currency}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            Average deliverable payout size
          </p>
        </div>
      </div>

      {/* Controls: Search, Status Filters & Type Filters */}
      <div className="mt-8 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        {/* Status Tab Filters */}
        <div className="flex flex-wrap gap-2">
          {statusTabs.map((tab) => {
            const isSelected =
              tab.id === "ALL" ? !currentStatus : currentStatus.toUpperCase() === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleFilterChange("status", tab.id)}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                  isSelected
                    ? "bg-zinc-900 text-white shadow dark:bg-white dark:text-zinc-950"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    isSelected
                      ? "bg-zinc-700 text-white dark:bg-zinc-200 dark:text-zinc-900"
                      : "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right Controls: Type Selector & Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Deliverable Type Select */}
          <select
            value={currentType.toUpperCase() || "ALL"}
            aria-label="Filter deliverables by type"
            onChange={(e) => handleFilterChange("type", e.target.value)}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-sm focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          >
            <option value="ALL">All Deliverables</option>
            <option value="MILESTONE">Milestones (Fixed)</option>
            <option value="HOURLY_TIMESHEET">Timesheets (Hourly)</option>
          </select>

          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 sm:w-64">
            <input
              type="text"
              placeholder="Search client or contract..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 pl-8 text-xs text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            />
            <span className="absolute left-2.5 top-2.5 text-zinc-400 text-xs">
              🔍
            </span>
          </form>
        </div>
      </div>

      {/* Payment Records Section */}
      <div className="mt-6 rounded-2xl border border-zinc-200/90 bg-white shadow-sm overflow-hidden dark:border-zinc-800 dark:bg-zinc-900/90">
        {payments.length === 0 ? (
          <div className="py-16 text-center px-4">
            <div className="text-4xl mb-3">🧾</div>
            <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
              No payment transactions found
            </h3>
            <p className="mt-1 text-xs text-zinc-500 max-w-sm mx-auto">
              {currentStatus || currentType || searchQuery
                ? "No client payments match your selected search filters."
                : "When clients approve and settle milestones or timesheet sessions, payments will appear here."}
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              {(currentStatus || currentType || searchQuery) && (
                <button
                  type="button"
                  onClick={() => router.push("/dashboard/freelancer/payments")}
                  className="rounded-xl border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  Clear Filters
                </button>
              )}
              <Link
                href="/contracts"
                className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                Go to Active Contracts
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-100 bg-zinc-50/75 text-[11px] font-bold text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-400 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4 sm:px-6">Client & Project</th>
                  <th className="py-3 px-4">Deliverable</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Gateway Status</th>
                  <th className="py-3 px-4 sm:px-6 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {payments.map((p) => {
                  const isSuccess = p.status === "SUCCESS";
                  const isPending = p.status === "PENDING";

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition"
                    >
                      {/* Client & Contract */}
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center font-bold text-xs shrink-0">
                            {p.clientName.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-zinc-900 dark:text-white truncate max-w-[200px] sm:max-w-xs">
                              {p.clientName}
                            </div>
                            <Link
                              href={`/contracts/${p.contractId}`}
                              className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline truncate block max-w-[200px] sm:max-w-xs"
                            >
                              {p.contractTitle}
                            </Link>
                          </div>
                        </div>
                      </td>

                      {/* Deliverable Type */}
                      <td className="py-3.5 px-4">
                        {p.itemType === "MILESTONE" ? (
                          <div className="flex flex-col">
                            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                              {p.milestoneTitle || "Fixed Milestone"}
                            </span>
                            <span className="text-[10px] text-zinc-400 font-mono">
                              Fixed Milestone
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                              Hourly Timesheet
                            </span>
                            <span className="text-[10px] text-zinc-400">
                              {p.sessionCount} work session{p.sessionCount === 1 ? "" : "s"}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4 font-mono">
                        <span className="font-extrabold text-sm text-zinc-900 dark:text-white">
                          ${p.amount.toFixed(2)}
                        </span>{" "}
                        <span className="text-[10px] font-bold text-zinc-500">
                          {p.currency}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="py-3.5 px-4 text-zinc-600 dark:text-zinc-400">
                        {p.paidAt ? formatDate(p.paidAt) : formatDate(p.createdAt)}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {isSuccess ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                            <span>✓</span> Settled
                          </span>
                        ) : isPending ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                            <span>⏳</span> Pending
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                            <span>⚠️</span> Failed
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 sm:px-6 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedPayment(p)}
                          className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 transition"
                        >
                          View Receipt
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/50 px-4 py-3 sm:px-6 dark:border-zinc-800 dark:bg-zinc-800/30">
            <span className="text-xs text-zinc-500">
              Showing page <strong className="text-zinc-700 dark:text-zinc-300">{currentPage}</strong> of{" "}
              <strong className="text-zinc-700 dark:text-zinc-300">{totalPages}</strong> ({totalPayments} total)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => handlePageChange(currentPage - 1)}
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => handlePageChange(currentPage + 1)}
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Transaction Details Modal */}
      {selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-4 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🧾</span>
                <div>
                  <h3 className="text-base font-extrabold text-zinc-950 dark:text-white">
                    Payment Transaction Receipt
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    Cryptographic Razorpay Gateway Settlement
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPayment(null)}
                className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-4 text-xs">
              {/* Amount Highlight */}
              <div className="rounded-2xl bg-zinc-50 p-4 text-center dark:bg-zinc-800/50">
                <span className="text-[11px] font-semibold text-zinc-500">Amount Settled</span>
                <div className="mt-1 text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                  ${selectedPayment.amount.toFixed(2)}{" "}
                  <span className="text-xs text-zinc-500">{selectedPayment.currency}</span>
                </div>
                <div className="mt-1">
                  {selectedPayment.status === "SUCCESS" ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                      ✓ Settled via Razorpay Checkout
                    </span>
                  ) : selectedPayment.status === "PENDING" ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                      ⏳ Pending Gateway Capture
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                      ⚠️ Gateway Transaction Failed
                    </span>
                  )}
                </div>
              </div>

              {/* Transaction Metadata Grid */}
              <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
                <div className="flex justify-between py-2.5 px-3">
                  <span className="text-zinc-500">Client:</span>
                  <span className="font-bold text-zinc-900 dark:text-white">
                    {selectedPayment.clientName} ({selectedPayment.clientEmail})
                  </span>
                </div>

                <div className="flex justify-between py-2.5 px-3">
                  <span className="text-zinc-500">Contract:</span>
                  <Link
                    href={`/contracts/${selectedPayment.contractId}`}
                    className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline truncate max-w-[220px]"
                  >
                    {selectedPayment.contractTitle}
                  </Link>
                </div>

                <div className="flex justify-between py-2.5 px-3">
                  <span className="text-zinc-500">Deliverable:</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                    {selectedPayment.itemType === "MILESTONE"
                      ? selectedPayment.milestoneTitle || "Milestone"
                      : `Hourly Timesheet (${selectedPayment.sessionCount} sessions)`}
                  </span>
                </div>

                <div className="flex items-center justify-between py-2.5 px-3">
                  <span className="text-zinc-500">Razorpay Order ID:</span>
                  <div className="flex items-center gap-1.5 font-mono text-[11px]">
                    <span className="text-zinc-800 dark:text-zinc-200">
                      {selectedPayment.razorpayOrderId}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(selectedPayment.razorpayOrderId, "order")}
                      className="text-emerald-600 hover:text-emerald-500 text-[10px]"
                    >
                      {copiedId === "order" ? "Copied!" : "📋"}
                    </button>
                  </div>
                </div>

                {selectedPayment.razorpayPaymentId && (
                  <div className="flex items-center justify-between py-2.5 px-3">
                    <span className="text-zinc-500">Gateway Payment ID:</span>
                    <div className="flex items-center gap-1.5 font-mono text-[11px]">
                      <span className="text-zinc-800 dark:text-zinc-200">
                        {selectedPayment.razorpayPaymentId}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selectedPayment.razorpayPaymentId || "", "pay")}
                        className="text-emerald-600 hover:text-emerald-500 text-[10px]"
                      >
                        {copiedId === "pay" ? "Copied!" : "📋"}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex justify-between py-2.5 px-3">
                  <span className="text-zinc-500">Settled At:</span>
                  <span className="text-zinc-800 dark:text-zinc-200">
                    {selectedPayment.paidAt ? formatDate(selectedPayment.paidAt) : "Pending"}
                  </span>
                </div>

                <div className="flex justify-between py-2.5 px-3">
                  <span className="text-zinc-500">Order Initiated:</span>
                  <span className="text-zinc-800 dark:text-zinc-200">
                    {formatDate(selectedPayment.createdAt)}
                  </span>
                </div>

                {selectedPayment.failureReason && (
                  <div className="py-2.5 px-3 bg-rose-50/50 dark:bg-rose-950/20">
                    <span className="text-rose-600 dark:text-rose-400 font-semibold block">
                      Failure Reason:
                    </span>
                    <span className="text-rose-700 dark:text-rose-300 text-[11px]">
                      {selectedPayment.failureReason}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedPayment(null)}
                className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 transition"
              >
                Close Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
