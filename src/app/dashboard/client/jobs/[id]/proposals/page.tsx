import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isValidObjectId } from "@/lib/jobs";
import { Role } from "@prisma/client";
import {
  ClientProposalReview,
  ReviewJobSummary,
  ReviewProposalItem,
} from "@/components/dashboard/ClientProposalReview";
import Link from "next/link";

interface ClientProposalsPageProps {
  params: Promise<{
    id: string;
  }>;
}

export async function generateMetadata({
  params,
}: ClientProposalsPageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Review Proposals | WorkPulse`,
    description: `Review applicant proposals for job ${id}`,
  };
}

async function ProposalsReviewContent({ params }: ClientProposalsPageProps) {
  await connection();
  const user = await requireRole(Role.CLIENT, "/login");
  const { id } = await params;

  if (!id || !isValidObjectId(id)) {
    notFound();
  }

  const job = await prisma.job.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      type: true,
      budget: true,
      hourlyMin: true,
      hourlyMax: true,
      status: true,
      clientId: true,
      proposalsCount: true,
      createdAt: true,
    },
  });

  if (!job) {
    notFound();
  }

  // Strictly verify client ownership: only the client who created this job can review proposals
  if (job.clientId !== user.id) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="rounded-3xl border border-zinc-200 bg-white p-10 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
            🔒
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
            Access Restricted
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            You do not own this job posting and are not authorized to review candidate proposals.
          </p>
          <div className="mt-6">
            <Link
              href="/jobs"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              ← Back to Marketplace
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const rawProposals = await prisma.proposal.findMany({
    where: { jobId: job.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      jobId: true,
      freelancerId: true,
      coverLetter: true,
      bidAmount: true,
      estimatedDuration: true,
      status: true,
      createdAt: true,
      freelancer: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          createdAt: true,
        },
      },
    },
  });

  const jobSummary: ReviewJobSummary = {
    id: job.id,
    title: job.title,
    type: job.type,
    budget: job.budget,
    hourlyMin: job.hourlyMin,
    hourlyMax: job.hourlyMax,
    status: job.status,
    proposalsCount: job.proposalsCount,
    createdAt: job.createdAt.toISOString(),
  };

  const proposals: ReviewProposalItem[] = rawProposals.map((p) => ({
    id: p.id,
    jobId: p.jobId,
    freelancerId: p.freelancerId,
    coverLetter: p.coverLetter,
    bidAmount: p.bidAmount,
    estimatedDuration: p.estimatedDuration,
    status: p.status as "PENDING" | "ACCEPTED" | "REJECTED",
    createdAt: p.createdAt.toISOString(),
    freelancer: {
      id: p.freelancer.id,
      name: p.freelancer.name,
      email: p.freelancer.email,
      image: p.freelancer.image,
      createdAt: p.freelancer.createdAt?.toISOString(),
    },
  }));

  return <ClientProposalReview job={jobSummary} initialProposals={proposals} />;
}

export default function ClientProposalsPage({ params }: ClientProposalsPageProps) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16 text-center text-sm text-zinc-500">
          Loading Proposals...
        </div>
      }
    >
      <ProposalsReviewContent params={params} />
    </Suspense>
  );
}
