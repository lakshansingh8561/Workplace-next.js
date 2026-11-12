import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { searchFreelancersAction } from "@/lib/actions/freelancer-discovery";
import { FreelancerDiscoveryView } from "@/components/discovery/FreelancerDiscoveryView";

export const metadata: Metadata = {
  title: "Find Top Freelancers | WorkPulse Marketplace",
  description:
    "Discover, interview, and hire vetted freelance developers, UI/UX designers, AI specialists, and marketers on WorkPulse. Real verified client reviews and competitive rates.",
};

interface FreelancersPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

async function FreelancersContent({ searchParams }: FreelancersPageProps) {
  await connection();
  const resolved = await searchParams;

  const query = typeof resolved.query === "string" ? resolved.query : undefined;
  const skill = typeof resolved.skill === "string" ? resolved.skill : undefined;
  const experience = typeof resolved.experience === "string" ? resolved.experience : undefined;
  const minRate =
    typeof resolved.minRate === "string" ? parseFloat(resolved.minRate) : undefined;
  const maxRate =
    typeof resolved.maxRate === "string" ? parseFloat(resolved.maxRate) : undefined;
  const isAvailable =
    resolved.isAvailable === "true"
      ? true
      : resolved.isAvailable === "false"
      ? false
      : undefined;
  const minRating =
    typeof resolved.minRating === "string" ? parseFloat(resolved.minRating) : undefined;
  const sort =
    resolved.sort === "rate_asc" ||
    resolved.sort === "rate_desc" ||
    resolved.sort === "recent" ||
    resolved.sort === "rating"
      ? resolved.sort
      : "rating";
  const page = typeof resolved.page === "string" ? parseInt(resolved.page, 10) : 1;

  const initialData = await searchFreelancersAction({
    query,
    skill,
    experience,
    minRate: isNaN(minRate ?? NaN) ? undefined : minRate,
    maxRate: isNaN(maxRate ?? NaN) ? undefined : maxRate,
    isAvailable,
    minRating: isNaN(minRating ?? NaN) ? undefined : minRating,
    sort,
    page: isNaN(page) ? 1 : page,
    limit: 12,
  });

  return <FreelancerDiscoveryView initialData={initialData} />;
}

export default function FreelancersPage({ searchParams }: FreelancersPageProps) {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-16">
      <Suspense
        fallback={
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            <p className="mt-3 text-xs text-zinc-500 font-medium">Loading talent directory...</p>
          </div>
        }
      >
        <FreelancersContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

