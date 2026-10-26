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

import { connection } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getFreelancerProposalForJob } from "@/lib/actions/proposal";

async function JobContent({ params }: JobPageProps) {
  await connection();
  const { id } = await params;
  const user = await getCurrentUser();
  const initialProposal =
    user?.role === "FREELANCER" ? await getFreelancerProposalForJob(id) : null;

  return (
    <JobDetailsView
      jobId={id}
      initialUser={user}
      initialProposal={initialProposal}
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
