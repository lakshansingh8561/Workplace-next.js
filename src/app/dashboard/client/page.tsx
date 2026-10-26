import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { Role, JobStatus, Prisma } from "@prisma/client";
import {
  ClientDashboardView,
  ClientDashboardJob,
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
  }>;
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

  // Single query with live proposal count to eliminate N+1 and count divergence
  const [totalJobs, rawJobs] = await Promise.all([
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
      key={`${statusParam || "ALL"}-${searchQuery}-${page}`}
      jobs={jobs}
      totalJobs={totalJobs}
      currentPage={page}
      totalPages={totalPages}
      currentStatus={statusParam || ""}
      searchQuery={searchQuery}
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
