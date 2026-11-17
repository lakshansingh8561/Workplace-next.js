import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { Role, JobStatus, Prisma } from "@prisma/client";
import {
  ClientDashboardView,
  ClientDashboardJob,
  ClientDashboardFreelancer,
} from "@/components/dashboard/ClientDashboardView";

export const metadata: Metadata = {
  title: "Client Dashboard | WorkPulse",
  description: "Manage your posted freelance jobs, contract statuses, and applicant proposals.",
};

interface ClientDashboardPageProps {
  searchParams: Promise<{
    status?: string;
    search?: string;
    page?: string;
    tab?: string;
  }>;
}

let cachedFreelancers: { data: ClientDashboardFreelancer[]; expiresAt: number } | null = null;

async function getCachedAvailableFreelancers(): Promise<ClientDashboardFreelancer[]> {
  const now = Date.now();
  if (cachedFreelancers && cachedFreelancers.expiresAt > now) {
    return cachedFreelancers.data;
  }
  const data = await prisma.user.findMany({
    where: { role: "FREELANCER", isAvailable: true, visibility: "PUBLIC" },
    orderBy: { updatedAt: "desc" },
    take: 4,
    select: {
      id: true,
      name: true,
      image: true,
      title: true,
      skills: true,
      hourlyRate: true,
      location: true,
    },
  });
  cachedFreelancers = { data, expiresAt: now + 60_000 };
  return data;
}

async function ClientDashboardContent({
  searchParams,
}: ClientDashboardPageProps) {
  await connection();
  const user = await requireRole(Role.CLIENT, "/login");
  const params = await searchParams;

  const statusParam = params.status?.toUpperCase();
  const searchQuery = params.search?.trim() || "";
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const limit = 10;
  const skip = (page - 1) * limit;

  // Build where clause strictly scoped to current authenticated client
  const where: Prisma.JobWhereInput = {
    clientId: user.id,
  };

  if (
    statusParam &&
    Object.values(JobStatus).includes(statusParam as JobStatus)
  ) {
    where.status = statusParam as JobStatus;
  }

  if (searchQuery) {
    where.OR = [
      { title: { contains: searchQuery, mode: "insensitive" } },
      { description: { contains: searchQuery, mode: "insensitive" } },
      { category: { contains: searchQuery, mode: "insensitive" } },
    ];
  }

  // Query in parallel
  const [
    totalJobs,
    rawJobs,
    activeJobsCount,
    totalProposalsCount,
    ongoingContracts,
    recentProposals,
    availableFreelancers,
    hiringOffers,
    recentConversations,
  ] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        title: true,
        category: true,
        type: true,
        budget: true,
        hourlyMin: true,
        hourlyMax: true,
        status: true,
        createdAt: true,
        _count: {
          select: { proposals: true },
        },
      },
    }),
    prisma.job.count({
      where: { clientId: user.id, status: "OPEN" },
    }),
    prisma.proposal.count({
      where: { job: { clientId: user.id } },
    }),
    prisma.contract.findMany({
      where: { clientId: user.id, status: "ACTIVE" },
      orderBy: { startDate: "desc" },
      take: 6,
      include: {
        freelancer: {
          select: {
            id: true,
            name: true,
            image: true,
            title: true,
          },
        },
      },
    }),
    prisma.proposal.findMany({
      where: { job: { clientId: user.id } },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        job: { select: { id: true, title: true, type: true } },
        freelancer: {
          select: {
            id: true,
            name: true,
            image: true,
            title: true,
            hourlyRate: true,
          },
        },
      },
    }),
    getCachedAvailableFreelancers(),
    prisma.hiringOffer.findMany({
      where: { clientId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: {
        freelancer: { select: { id: true, name: true, image: true, title: true } },
      },
    }),
    prisma.conversation.findMany({
      where: { clientId: user.id },
      orderBy: { lastMessageAt: "desc" },
      take: 5,
      include: {
        freelancer: { select: { id: true, name: true, image: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
  ]);

  const jobs: ClientDashboardJob[] = rawJobs.map((j) => ({
    id: j.id,
    title: j.title,
    category: j.category,
    type: j.type,
    budget: j.budget,
    hourlyMin: j.hourlyMin,
    hourlyMax: j.hourlyMax,
    status: j.status,
    proposalsCount: j._count.proposals,
    createdAt: j.createdAt.toISOString(),
  }));

  const totalPages = Math.ceil(totalJobs / limit) || 1;

  return (
    <ClientDashboardView
      key={`${statusParam || "ALL"}-${searchQuery}-${page}-${totalJobs}-${jobs[0]?.id || "empty"}`}
      jobs={jobs}
      totalJobs={totalJobs}
      currentPage={page}
      totalPages={totalPages}
      currentStatus={statusParam || ""}
      searchQuery={searchQuery}
      activeJobsCount={activeJobsCount}
      totalProposalsCount={totalProposalsCount}
      ongoingContractsCount={ongoingContracts.length}
      ongoingContracts={ongoingContracts.map((c) => ({
        id: c.id,
        title: c.title,
        type: c.type,
        totalAmount: c.totalAmount,
        hourlyRate: c.hourlyRate,
        startDate: c.startDate.toISOString(),
        freelancer: c.freelancer,
      }))}
      recentProposals={recentProposals.map((p) => ({
        id: p.id,
        jobId: p.jobId,
        freelancerId: p.freelancerId,
        bidAmount: p.bidAmount,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        job: p.job,
        freelancer: p.freelancer,
      }))}
      availableFreelancers={availableFreelancers}
      hiringOffers={hiringOffers.map((o) => ({
        id: o.id,
        title: o.title,
        type: o.type,
        amount: o.amount,
        status: o.status,
        updatedAt: o.updatedAt.toISOString(),
        freelancer: o.freelancer,
      }))}
      recentConversations={recentConversations.map((c) => ({
        id: c.id,
        lastMessageAt: c.lastMessageAt.toISOString(),
        freelancer: c.freelancer,
        lastMessage: c.messages[0]?.content || "Conversation started",
      }))}
    />
  );
}

export default function ClientDashboardPage({
  searchParams,
}: ClientDashboardPageProps) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 text-center text-sm text-zinc-500">
          Loading Client Dashboard...
        </div>
      }
    >
      <ClientDashboardContent searchParams={searchParams} />
    </Suspense>
  );
}
