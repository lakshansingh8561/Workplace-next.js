import { Suspense } from "react";
import type { Metadata } from "next";
import { JobDetailsView } from "@/components/jobs/JobDetailsView";

interface JobPageProps {
  params: Promise<{
    id: string;
  }>;
}

export async function generateMetadata({
  params,
}: JobPageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Job Details | WorkPulse Marketplace`,
    description: `View full freelance contract specifications for job ${id}`,
  };
}

import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getFreelancerProposalForJob } from "@/lib/actions/proposal";
import { getJobById, isValidObjectId } from "@/lib/jobs";
import { prisma } from "@/lib/prisma";

async function JobContent({ params }: JobPageProps) {
  await connection();
  const { id } = await params;

  if (!id || !isValidObjectId(id)) {
    notFound();
  }

  const user = await getCurrentUser();
  const { data: job } = await getJobById(id);

  if (!job) {
    notFound();
  }

  // DRAFT jobs must not be publicly available for application; only owner can view
  if (job.status === "DRAFT" && (!user || job.clientId !== user.id)) {
    notFound();
  }

  const initialProposal =
    user?.role === "FREELANCER" ? await getFreelancerProposalForJob(id) : null;

  let initialSaved = false;
  if (user?.role === "FREELANCER") {
    const saved = await prisma.savedJob.findUnique({
      where: {
        userId_jobId: {
          userId: user.id,
          jobId: id,
        },
      },
      select: { id: true },
    });
    initialSaved = Boolean(saved);
  }

  return (
    <JobDetailsView
      jobId={id}
      initialJob={job}
      initialUser={user}
      initialProposal={initialProposal}
      initialSaved={initialSaved}
    />
  );
}

export default function JobDetailPage({ params }: JobPageProps) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16 text-center text-sm text-zinc-500">
          Loading Contract Details...
        </div>
      }
    >
      <JobContent params={params} />
    </Suspense>
  );
}
