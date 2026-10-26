import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { ProposalStatus, Prisma } from "@prisma/client";
import { Role } from "@/types";
import {
  FreelancerDashboardView,
  FreelancerDashboardProposal,
} from "@/components/dashboard/FreelancerDashboardView";

export const metadata: Metadata = {
  title: "Freelancer Dashboard | WorkPulse",
  description: "View and manage your submitted freelance proposals and client review statuses.",
};

interface FreelancerDashboardPageProps {
  searchParams: Promise<{
    status?: string;
    search?: string;
    page?: string;
  }>;
}

async function FreelancerDashboardContent({
  searchParams,
}: FreelancerDashboardPageProps) {
  await connection();
  const user = await requireRole(Role.FREELANCER, "/login");
  const params = await searchParams;

  const statusParam = params.status?.toUpperCase();
  const searchQuery = params.search?.trim() || "";
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const limit = 10;
  const skip = (page - 1) * limit;

  // Build where clause strictly scoped to current authenticated freelancer
  const where: Prisma.ProposalWhereInput = {
    freelancerId: user.id,
  };

  if (
    statusParam &&
    Object.values(ProposalStatus).includes(statusParam as ProposalStatus)
  ) {
    where.status = statusParam as ProposalStatus;
  }

  if (searchQuery) {
    where.OR = [
      { coverLetter: { contains: searchQuery, mode: "insensitive" } },
      {
        job: {
          title: { contains: searchQuery, mode: "insensitive" },
        },
      },
      {
        job: {
          category: { contains: searchQuery, mode: "insensitive" },
        },
      },
    ];
  }

  const [totalProposals, rawProposals] = await Promise.all([
    prisma.proposal.count({ where }),
    prisma.proposal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        bidAmount: true,
        estimatedDuration: true,
        coverLetter: true,
        status: true,
        createdAt: true,
        job: {
          select: {
            id: true,
            title: true,
            category: true,
            type: true,
            budget: true,
            hourlyMin: true,
            hourlyMax: true,
            status: true,
            clientName: true,
            clientCountry: true,
          },
        },
      },
    }),
  ]);

  const proposals: FreelancerDashboardProposal[] = rawProposals.map((p) => ({
    id: p.id,
    bidAmount: p.bidAmount,
    estimatedDuration: p.estimatedDuration,
    coverLetter: p.coverLetter,
    status: p.status as "PENDING" | "ACCEPTED" | "REJECTED",
    createdAt: p.createdAt.toISOString(),
    job: {
      id: p.job.id,
      title: p.job.title,
      category: p.job.category,
      type: p.job.type,
      budget: p.job.budget,
      hourlyMin: p.job.hourlyMin,
      hourlyMax: p.job.hourlyMax,
      status: p.job.status,
      clientName: p.job.clientName,
      clientCountry: p.job.clientCountry,
    },
  }));

  const totalPages = Math.ceil(totalProposals / limit) || 1;

  return (
    <FreelancerDashboardView
      proposals={proposals}
      totalProposals={totalProposals}
      currentPage={page}
      totalPages={totalPages}
      currentStatus={statusParam || ""}
      searchQuery={searchQuery}
    />
  );
}

export default function FreelancerDashboardPage({
  searchParams,
}: FreelancerDashboardPageProps) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 text-center text-sm text-zinc-500">
          Loading Proposals...
        </div>
      }
    >
      <FreelancerDashboardContent searchParams={searchParams} />
    </Suspense>
  );
}
