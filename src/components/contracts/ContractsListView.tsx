"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ContractStatus, PaymentType } from "@prisma/client";
import { formatDate } from "@/lib/utils";

export interface ContractListItem {
  id: string;
  title: string;
  type: PaymentType;
  totalAmount?: number | null;
  hourlyRate?: number | null;
  status: ContractStatus;
  startDate: string;
  counterpartyName: string;
  counterpartyRole: "Client" | "Freelancer";
  jobId: string;
  milestonesCount: number;
  approvedMilestonesCount: number;
}

interface ContractsListViewProps {
  contracts: ContractListItem[];
  totalContracts: number;
  userRole: "CLIENT" | "FREELANCER";
  currentStatus: string;
}

export function ContractsListView({
  contracts,
  totalContracts,
  userRole,
  currentStatus,
}: ContractsListViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");

  const handleStatusFilter = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (status === "ALL") {
      params.delete("status");
    } else {
      params.set("status", status);
    }
    router.push(`/contracts?${params.toString()}`);
  };

  const filteredContracts = contracts.filter((c) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      c.counterpartyName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-zinc-200/80 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
              {userRole === "CLIENT" ? "Client Contracts" : "Freelancer Contracts"}
            </h1>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {totalContracts} {totalContracts === 1 ? "Contract" : "Contracts"}
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            Manage your active agreements, track milestone deliverables, and monitor project milestones.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {userRole === "CLIENT" ? (
            <Link
              href="/dashboard/client"
              className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 transition"
            >
              ← Client Dashboard
            </Link>
          ) : (
            <Link
              href="/dashboard/freelancer"
              className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 transition"
            >
              ← My Proposals
            </Link>
          )}
        </div>
      </div>

      {/* Controls: Search & Status Filters */}
      <div className="mt-6 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        {/* Status Tab Filters */}
        <div className="flex flex-wrap gap-2">
          {["ALL", "ACTIVE", "PAUSED", "COMPLETED", "TERMINATED"].map((status) => {
            const isSelected =
              status === "ALL" ? !currentStatus : currentStatus.toUpperCase() === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => handleStatusFilter(status)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                  isSelected
                    ? "bg-zinc-900 text-white shadow dark:bg-white dark:text-zinc-950"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                {status === "ALL"
                  ? "All Contracts"
                  : status.charAt(0) + status.slice(1).toLowerCase()}
              </button>
            );
          })}
        </div>

        {/* Local Search Input */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Filter by title or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="rounded-xl border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-600"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Contracts List or Empty State */}
      {filteredContracts.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-12 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl dark:bg-zinc-800">
            📄
          </div>
          <h3 className="mt-4 text-lg font-bold text-zinc-900 dark:text-white">
            {searchTerm || currentStatus
              ? "No matching contracts found"
              : "No active contracts yet"}
          </h3>
          <p className="mt-2 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
            {userRole === "CLIENT"
              ? "When you accept a freelancer proposal, a formal contract is formed and will appear here."
              : "When a client accepts your proposal, your active work agreement and milestone deliverables will appear here."}
          </p>
          <div className="mt-6">
            {userRole === "CLIENT" ? (
              <Link
                href="/dashboard/client"
                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition"
              >
                Review Submitted Proposals
              </Link>
            ) : (
              <Link
                href="/jobs"
                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition"
              >
                Find Marketplace Jobs
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {filteredContracts.map((contract) => {
            const isHourly = contract.type === "HOURLY";
            const formattedAgreed = isHourly
              ? `$${contract.hourlyRate ?? 0} / hr`
              : `$${contract.totalAmount?.toLocaleString() ?? 0} Fixed`;

            return (
              <div
                key={contract.id}
                className="rounded-3xl border border-zinc-200/90 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 transition hover:border-zinc-300 dark:hover:border-zinc-700"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Contract Details */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {contract.counterpartyRole}: {contract.counterpartyName}
                      </span>
                      <span className="text-zinc-300 dark:text-zinc-700">•</span>
                      <span className="text-zinc-500" suppressHydrationWarning>
                        Started {formatDate(contract.startDate)}
                      </span>
                      <span className="text-zinc-300 dark:text-zinc-700">•</span>
                      <span className="font-bold text-zinc-800 dark:text-zinc-200">
                        {formattedAgreed}
                      </span>
                    </div>

                    <Link
                      href={`/contracts/${contract.id}`}
                      className="block text-lg font-bold text-zinc-950 dark:text-white hover:text-emerald-600 transition"
                    >
                      {contract.title}
                    </Link>

                    {/* Milestones Summary */}
                    <div className="flex items-center gap-2 pt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <span>Milestones:</span>
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                        {contract.approvedMilestonesCount} of {contract.milestonesCount} approved
                      </span>
                    </div>
                  </div>

                  {/* Status & View CTA */}
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${
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
                      href={`/contracts/${contract.id}`}
                      className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition active:scale-95"
                    >
                      View Contract →
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
