import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { Role } from "@/types";
import { getFreelancerProposals } from "@/lib/actions/proposal";
import { FreelancerProposalsView } from "@/components/dashboard/FreelancerProposalsView";

export const metadata: Metadata = {
  title: "My Proposals | WorkPulse",
  description:
    "Track your submitted freelance job proposals, client review statuses, and awarded contracts.",
};

interface ProposalsPageProps {
  searchParams: Promise<{
    status?: string;
    search?: string;
    page?: string;
  }>;
}

async function ProposalsContent({ searchParams }: ProposalsPageProps) {
  await connection();
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login?redirectTo=/dashboard/freelancer/proposals");
  }

  if (user.role === Role.CLIENT) {
    redirect("/dashboard/client");
  }

  if (!user.roleSelected) {
    redirect("/onboarding/role");
  }

  const params = await searchParams;

  const result = await getFreelancerProposals({
    status: params.status,
    search: params.search,
    page: params.page,
    limit: 10,
  });

  return (
    <FreelancerProposalsView
      proposals={result.proposals}
      counts={result.counts}
      totalProposals={result.totalProposals}
      currentPage={result.currentPage}
      totalPages={result.totalPages}
      currentStatus={params.status || ""}
      searchQuery={params.search || ""}
    />
  );
}

export default function FreelancerProposalsPage({
  searchParams,
}: ProposalsPageProps) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 text-center text-sm text-zinc-500">
          Loading Proposals...
        </div>
      }
    >
      <ProposalsContent searchParams={searchParams} />
    </Suspense>
  );
}
