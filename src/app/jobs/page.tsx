import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { JobsExplorer } from "@/components/jobs/JobsExplorer";
import { getJobs } from "@/lib/jobs";

export const metadata: Metadata = {
  title: "Explore Freelance Jobs | WorkPulse Marketplace",
  description:
    "Discover high-impact freelance jobs and client contracts in development, AI, design, marketing, and finance.",
};

interface JobsPageProps {
  searchParams?: Promise<{
    search?: string;
    category?: string;
    type?: string;
    experienceLevel?: string;
    skill?: string;
    minBudget?: string;
    maxBudget?: string;
    sortBy?: string;
    page?: string;
  }>;
}

async function JobsPageContent({ searchParams }: JobsPageProps) {
  await connection();
  const [user, params] = await Promise.all([
    getCurrentUser(),
    searchParams ? searchParams : Promise.resolve({} as { [key: string]: string | undefined }),
  ]);

  let initialJobs = undefined;
  let initialPagination = undefined;
  let initialFacets = undefined;

  try {
    const jobsRes = await getJobs({
      search: params.search,
      category: params.category && params.category !== "all" ? params.category : undefined,
      type: params.type,
      experienceLevel: params.experienceLevel,
      skill: params.skill,
      minBudget: params.minBudget,
      maxBudget: params.maxBudget,
      sortBy: params.sortBy || "newest",
      page: params.page || "1",
      limit: "10",
      includeFacets: "true",
    });
    initialJobs = jobsRes.data;
    initialPagination = jobsRes.pagination;
    initialFacets = jobsRes.facets;
  } catch (err) {
    console.warn("[JobsPage SSR Preload Notice]:", err instanceof Error ? err.message : err);
  }

  // Allow CLIENT, FREELANCER, and unauthenticated public visitors
  // to browse the public jobs marketplace.
  return (
    <JobsExplorer
      userRole={user?.role}
      initialJobs={initialJobs}
      initialPagination={initialPagination}
      initialFacets={initialFacets}
    />
  );
}

export default function JobsPage({ searchParams }: JobsPageProps) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 py-16 text-center text-sm text-zinc-500">
          Loading WorkPulse Job Marketplace...
        </div>
      }
    >
      <JobsPageContent searchParams={searchParams} />
    </Suspense>
  );
}
