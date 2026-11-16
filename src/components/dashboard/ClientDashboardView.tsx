"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { updateJobStatusAction } from "@/lib/actions/job";
import { getOrCreateDirectConversationAction } from "@/lib/actions/message";
import { JobStatus } from "@prisma/client";
import { formatDate } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { DirectHireModal } from "@/components/dashboard/DirectHireModal";

export interface ClientDashboardJob {
  id: string;
  title: string;
  category: string;
  type: string;
  budget?: number | null;
  hourlyMin?: number | null;
  hourlyMax?: number | null;
  status: JobStatus;
  proposalsCount: number;
  createdAt: string;
}

export interface ClientDashboardContract {
  id: string;
  title: string;
  type: string;
  totalAmount?: number | null;
  hourlyRate?: number | null;
  startDate: string;
  freelancer: {
    id: string;
    name?: string | null;
    image?: string | null;
    title?: string | null;
  };
}

export interface ClientDashboardProposal {
  id: string;
  jobId: string;
  freelancerId: string;
  bidAmount: number;
  status: string;
  createdAt: string;
  job: {
    id: string;
    title: string;
    type: string;
  };
  freelancer: {
    id: string;
    name?: string | null;
    image?: string | null;
    title?: string | null;
    hourlyRate?: number | null;
  };
}

export interface ClientDashboardFreelancer {
  id: string;
  name?: string | null;
  image?: string | null;
  title?: string | null;
  skills?: string[];
  hourlyRate?: number | null;
  location?: string | null;
}

export interface ClientDashboardOffer {
  id: string;
  title: string;
  type: string;
  amount: number;
  status: string;
  updatedAt: string;
  freelancer: {
    id: string;
    name?: string | null;
    image?: string | null;
    title?: string | null;
  };
}

export interface ClientDashboardConversation {
  id: string;
  lastMessageAt: string;
  lastMessage: string;
  freelancer: {
    id: string;
    name?: string | null;
    image?: string | null;
  };
}

interface ClientDashboardViewProps {
  jobs: ClientDashboardJob[];
  totalJobs: number;
  currentPage: number;
  totalPages: number;
  currentStatus: string;
  searchQuery: string;
  activeJobsCount?: number;
  totalProposalsCount?: number;
  ongoingContractsCount?: number;
  ongoingContracts?: ClientDashboardContract[];
  recentProposals?: ClientDashboardProposal[];
  availableFreelancers?: ClientDashboardFreelancer[];
  hiringOffers?: ClientDashboardOffer[];
  recentConversations?: ClientDashboardConversation[];
}

export function ClientDashboardView({
  jobs: initialJobs,
  totalJobs,
  currentPage,
  totalPages,
  currentStatus,
  searchQuery,
  activeJobsCount = 0,
  totalProposalsCount = 0,
  ongoingContractsCount = 0,
  ongoingContracts = [],
  recentProposals = [],
  availableFreelancers = [],
  hiringOffers = [],
  recentConversations = [],
}: ClientDashboardViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState<ClientDashboardJob[]>(initialJobs);
  const [searchTerm, setSearchTerm] = useState(searchQuery);
  const [activeTab, setActiveTab] = useState<"JOBS" | "PROPOSALS" | "CONTRACTS" | "OFFERS" | "TALENT">("JOBS");
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [hireFreelancer, setHireFreelancer] = useState<ClientDashboardFreelancer | null>(null);
  const [isPending, startTransition] = useTransition();

  // Sync internal state immediately whenever server data updates
  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  useEffect(() => {
    setSearchTerm(searchQuery);
  }, [searchQuery]);

  const handleStatusFilter = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (status === "ALL") {
      params.delete("status");
    } else {
      params.set("status", status);
    }
    params.set("page", "1");
    router.push(`/dashboard/client?${params.toString()}`);
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
    router.push(`/dashboard/client?${params.toString()}`);
  };

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    router.push(`/dashboard/client?${params.toString()}`);
  };

  const handleStatusUpdate = (jobId: string, newStatus: JobStatus) => {
    setActionError(null);
    setActiveJobId(jobId);

    startTransition(async () => {
      const res = await updateJobStatusAction({ jobId, status: newStatus });
      if (res.success) {
        setJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j))
        );
      } else {
        setActionError(res.error || "Failed to update job status.");
      }
      setActiveJobId(null);
    });
  };

  const handleStartChat = async (freelancerId: string) => {
    try {
      const res = await getOrCreateDirectConversationAction(freelancerId);
      if (res.success && res.conversationId) {
        router.push(`/messages?conversationId=${res.conversationId}`);
      }
    } catch (err) {
      console.error("Chat error:", err);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-zinc-200/80 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
            Client Workspace
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            Monitor active hiring, review applicants, negotiate proposals, and manage talent contracts.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/freelancers"
            className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition"
          >
            Find Freelancers 🔍
          </Link>
          <Link
            href="/jobs/new"
            className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 transition"
          >
            + Post a Job
          </Link>
        </div>
      </div>

      {/* KPI Stats Overview Cards */}
      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Jobs */}
        <div
          onClick={() => setActiveTab("JOBS")}
          className="cursor-pointer rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs hover:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 transition"
        >
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs font-semibold">
            <span>Active Jobs</span>
            <span>💼</span>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-zinc-950 dark:text-white">
            {activeJobsCount}
          </p>
          <span className="text-[11px] text-zinc-400">
            {totalJobs} total contracts posted
          </span>
        </div>

        {/* Received Proposals */}
        <div
          onClick={() => setActiveTab("PROPOSALS")}
          className="cursor-pointer rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs hover:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 transition"
        >
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs font-semibold">
            <span>Applicants / Proposals</span>
            <span>📬</span>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {totalProposalsCount}
          </p>
          <span className="text-[11px] text-zinc-400">
            Review & negotiate bids
          </span>
        </div>

        {/* Ongoing Contracts */}
        <div
          onClick={() => setActiveTab("CONTRACTS")}
          className="cursor-pointer rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs hover:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 transition"
        >
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs font-semibold">
            <span>Ongoing Contracts</span>
            <span>🤝</span>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-zinc-950 dark:text-white">
            {ongoingContractsCount}
          </p>
          <span className="text-[11px] text-zinc-400">
            Active milestone work
          </span>
        </div>

        {/* Direct Offers */}
        <div
          onClick={() => setActiveTab("OFFERS")}
          className="cursor-pointer rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs hover:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 transition"
        >
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs font-semibold">
            <span>Hiring Offers</span>
            <span>🚀</span>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">
            {hiringOffers.length}
          </p>
          <span className="text-[11px] text-zinc-400">
            Direct offers & negotiations
          </span>
        </div>
      </div>

      {actionError && (
        <div className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900">
          ⚠️ {actionError}
        </div>
      )}

      {/* Main Dashboard Tabs */}
      <div className="mt-8 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex flex-wrap gap-2 sm:gap-6 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab("JOBS")}
            className={`pb-3 transition border-b-2 ${
              activeTab === "JOBS"
                ? "border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400"
                : "border-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            My Job Postings ({totalJobs})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("PROPOSALS")}
            className={`pb-3 transition border-b-2 ${
              activeTab === "PROPOSALS"
                ? "border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400"
                : "border-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            Recent Proposals ({recentProposals.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("CONTRACTS")}
            className={`pb-3 transition border-b-2 ${
              activeTab === "CONTRACTS"
                ? "border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400"
                : "border-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            Active Contracts ({ongoingContracts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("OFFERS")}
            className={`pb-3 transition border-b-2 ${
              activeTab === "OFFERS"
                ? "border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400"
                : "border-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            Hiring Offers ({hiringOffers.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("TALENT")}
            className={`pb-3 transition border-b-2 ${
              activeTab === "TALENT"
                ? "border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400"
                : "border-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            Available Talent ({availableFreelancers.length})
          </button>
        </div>
      </div>

      {/* TAB 1: MY JOBS */}
      {activeTab === "JOBS" && (
        <div className="mt-6">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center mb-6">
            <div className="flex flex-wrap gap-2">
              {["ALL", "OPEN", "PAUSED", "DRAFT", "CLOSED"].map((status) => {
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
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    {status === "ALL" ? "All Jobs" : status.charAt(0) + status.slice(1).toLowerCase()}
                  </button>
                );
              })}
            </div>

            <form onSubmit={handleSearchSubmit} className="flex gap-2">
              <input
                type="text"
                placeholder="Search jobs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="rounded-xl border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-900 shadow-xs focus:border-emerald-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
              />
              <button
                type="submit"
                className="rounded-xl bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 transition"
              >
                Search
              </button>
            </form>
          </div>

          {jobs.length === 0 ? (
            <div className="rounded-3xl border border-zinc-200 bg-white p-12 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl dark:bg-zinc-800 mb-3">
                💼
              </div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                No job postings found
              </h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
                Post your first freelance contract or adjust search filters.
              </p>
              <Link
                href="/jobs/new"
                className="mt-4 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition"
              >
                Post Job Now
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {jobs.map((job) => {
                const isHourly = job.type.toUpperCase() === "HOURLY";
                const formattedBudget = isHourly
                  ? `$${job.hourlyMin ?? 0} - $${job.hourlyMax ?? 0} / hr`
                  : `$${job.budget?.toLocaleString() ?? 0} Fixed`;

                return (
                  <div
                    key={job.id}
                    className="rounded-3xl border border-zinc-200/90 bg-white p-6 shadow-xs hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/90 transition"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {job.category}
                          </span>
                          <span className="text-zinc-300">•</span>
                          <span className="text-zinc-500">Posted {formatDate(job.createdAt)}</span>
                          <span className="text-zinc-300">•</span>
                          <span className="font-bold text-zinc-800 dark:text-zinc-200">{formattedBudget}</span>
                        </div>

                        <Link
                          href={`/jobs/${job.id}`}
                          className="block text-lg font-bold text-zinc-950 dark:text-white hover:text-emerald-600 transition"
                        >
                          {job.title}
                        </Link>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                            job.status === "OPEN"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-300"
                              : job.status === "PAUSED"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400 border border-amber-300"
                              : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          }`}
                        >
                          {job.status}
                        </span>

                        <Link
                          href={`/dashboard/client/jobs/${job.id}/proposals`}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-100 px-3.5 py-2 text-xs font-bold text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 transition"
                        >
                          <span>Review Proposals</span>
                          <span className="rounded-full bg-emerald-600 px-1.5 py-0.2 text-[10px] text-white">
                            {job.proposalsCount}
                          </span>
                        </Link>

                        {job.status === "OPEN" && (
                          <button
                            type="button"
                            onClick={() => handleStatusUpdate(job.id, "PAUSED" as JobStatus)}
                            className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 transition"
                          >
                            Pause
                          </button>
                        )}

                        {job.status === "PAUSED" && (
                          <button
                            type="button"
                            onClick={() => handleStatusUpdate(job.id, "OPEN" as JobStatus)}
                            className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition"
                          >
                            Reopen
                          </button>
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

      {/* TAB 2: PROPOSALS */}
      {activeTab === "PROPOSALS" && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-zinc-950 dark:text-white">
              Recent Applicant Proposals
            </h3>
            <Link
              href="/dashboard/client/proposals"
              className="text-xs font-bold text-emerald-600 hover:underline dark:text-emerald-400"
            >
              View All Proposals ({totalProposalsCount}) →
            </Link>
          </div>

          {recentProposals.length === 0 ? (
            <div className="rounded-3xl border border-zinc-200 bg-white p-10 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs text-zinc-500">No applicant proposals received yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recentProposals.map((p) => (
                <div
                  key={p.id}
                  className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <Avatar
                      src={p.freelancer.image}
                      name={p.freelancer.name}
                      role="FREELANCER"
                      userId={p.freelancer.id}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/freelancers/${p.freelancer.id}`}
                        className="text-sm font-bold text-zinc-950 hover:text-emerald-600 dark:text-white truncate block"
                      >
                        {p.freelancer.name || "Freelancer"}
                      </Link>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 truncate">
                        {p.freelancer.title || "Specialist"}
                      </p>
                      <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                        Applied for: <strong>{p.job.title}</strong>
                      </p>
                    </div>
                    <span className="text-xs font-extrabold text-zinc-900 dark:text-white shrink-0">
                      ${p.bidAmount.toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800 text-xs">
                    <span className="text-[10px] uppercase font-bold text-zinc-400">
                      Status: {p.status}
                    </span>
                    <Link
                      href={`/dashboard/client/jobs/${p.job.id}/proposals`}
                      className="font-bold text-emerald-600 hover:underline dark:text-emerald-400"
                    >
                      Review & Negotiate →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ONGOING CONTRACTS */}
      {activeTab === "CONTRACTS" && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-zinc-950 dark:text-white">
              Active Ongoing Contracts
            </h3>
            <Link
              href="/contracts"
              className="text-xs font-bold text-emerald-600 hover:underline dark:text-emerald-400"
            >
              All Contracts ({ongoingContractsCount}) →
            </Link>
          </div>

          {ongoingContracts.length === 0 ? (
            <div className="rounded-3xl border border-zinc-200 bg-white p-10 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs text-zinc-500">No active contracts right now.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ongoingContracts.map((c) => (
                <div
                  key={c.id}
                  className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <Avatar
                      src={c.freelancer.image}
                      name={c.freelancer.name}
                      role="FREELANCER"
                      userId={c.freelancer.id}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/contracts/${c.id}`}
                        className="text-sm font-bold text-zinc-950 hover:text-emerald-600 dark:text-white truncate block"
                      >
                        {c.title}
                      </Link>
                      <p className="text-xs text-zinc-500">Hired: {c.freelancer.name}</p>
                    </div>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                      Active
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800 text-xs">
                    <span className="text-zinc-500">
                      {c.type === "HOURLY"
                        ? `$${c.hourlyRate ?? 0}/hr`
                        : `$${c.totalAmount?.toLocaleString() ?? 0} Fixed`}
                    </span>
                    <Link
                      href={`/contracts/${c.id}`}
                      className="font-bold text-emerald-600 hover:underline dark:text-emerald-400"
                    >
                      Manage Contract →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: HIRING OFFERS */}
      {activeTab === "OFFERS" && (
        <div className="mt-6 space-y-4">
          <h3 className="text-base font-bold text-zinc-950 dark:text-white mb-4">
            Direct Hiring Offers & Negotiations
          </h3>

          {hiringOffers.length === 0 ? (
            <div className="rounded-3xl border border-zinc-200 bg-white p-10 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs text-zinc-500">
                You haven&apos;t sent any direct hiring offers yet. Browse freelancers to send a direct offer!
              </p>
              <Link
                href="/freelancers"
                className="mt-4 inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition"
              >
                Browse Freelancers
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {hiringOffers.map((o) => (
                <div
                  key={o.id}
                  className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <Avatar
                      src={o.freelancer.image}
                      name={o.freelancer.name}
                      role="FREELANCER"
                      userId={o.freelancer.id}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-zinc-950 dark:text-white truncate">
                        {o.title}
                      </h4>
                      <p className="text-xs text-zinc-500">To: {o.freelancer.name}</p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        o.status === "ACCEPTED"
                          ? "bg-emerald-100 text-emerald-800"
                          : o.status === "COUNTERED"
                          ? "bg-indigo-100 text-indigo-800"
                          : o.status === "DECLINED"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {o.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800 text-xs">
                    <span className="font-bold text-zinc-900 dark:text-white">
                      ${o.amount.toLocaleString()} {o.type === "HOURLY" ? "/ hr" : "Fixed"}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleStartChat(o.freelancer.id)}
                      className="font-bold text-emerald-600 hover:underline dark:text-emerald-400"
                    >
                      💬 Discuss in Chat →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: AVAILABLE TALENT */}
      {activeTab === "TALENT" && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-zinc-950 dark:text-white">
              Available Top Freelancers
            </h3>
            <Link
              href="/freelancers"
              className="text-xs font-bold text-emerald-600 hover:underline dark:text-emerald-400"
            >
              Explore All Freelancers →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {availableFreelancers.map((f) => (
              <div
                key={f.id}
                className="flex flex-col justify-between rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <Avatar
                      src={f.image}
                      name={f.name}
                      role="FREELANCER"
                      userId={f.id}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/freelancers/${f.id}`}
                        className="text-sm font-bold text-zinc-950 hover:text-emerald-600 dark:text-white truncate block"
                      >
                        {f.name || "Freelancer"}
                      </Link>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 truncate">
                        {f.title || "Specialist"}
                      </p>
                    </div>
                  </div>

                  {f.hourlyRate && (
                    <p className="text-xs font-extrabold text-zinc-900 dark:text-white mb-2">
                      ${f.hourlyRate}/hr
                    </p>
                  )}

                  {f.skills && f.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-4">
                      {f.skills.slice(0, 3).map((sk) => (
                        <span
                          key={sk}
                          className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        >
                          {sk}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => handleStartChat(f.id)}
                    className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[11px] font-bold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition"
                  >
                    💬 Chat
                  </button>
                  <button
                    type="button"
                    onClick={() => setHireFreelancer(f)}
                    className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-emerald-500 transition"
                  >
                    Hire
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pagination for Jobs tab */}
      {activeTab === "JOBS" && totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={currentPage <= 1 || isPending}
            onClick={() => handlePageChange(currentPage - 1)}
            className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition"
          >
            ← Previous
          </button>
          <span className="text-xs font-semibold text-zinc-500 px-3">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages || isPending}
            onClick={() => handlePageChange(currentPage + 1)}
            className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition"
          >
            Next →
          </button>
        </div>
      )}

      {/* Direct Hire Modal */}
      {hireFreelancer && (
        <DirectHireModal
          isOpen={Boolean(hireFreelancer)}
          onClose={() => setHireFreelancer(null)}
          freelancerId={hireFreelancer.id}
          freelancerName={hireFreelancer.name || "Freelancer"}
          freelancerHourlyRate={hireFreelancer.hourlyRate}
          clientJobs={jobs.map((j) => ({
            id: j.id,
            title: j.title,
            type: j.type === "HOURLY" ? "HOURLY" : "FIXED",
            budget: j.budget,
          }))}
          onSuccess={(_, conversationId) => {
            setHireFreelancer(null);
            if (conversationId) {
              router.push(`/messages?conversationId=${conversationId}`);
            } else {
              router.refresh();
            }
          }}
        />
      )}
    </div>
  );
}
