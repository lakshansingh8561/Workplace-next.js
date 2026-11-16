import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { JobsExplorer } from "@/components/jobs/JobsExplorer";

export const metadata: Metadata = {
  title: "Explore Freelance Jobs | WorkPulse Marketplace",
  description:
    "Discover high-impact freelance jobs and client contracts in development, AI, design, marketing, and finance.",
};

async function JobsPageContent() {
  await connection();
  const user = await getCurrentUser();

  // Allow CLIENT, FREELANCER, and unauthenticated public visitors
  // to browse the public jobs marketplace.
  return <JobsExplorer userRole={user?.role} />;
}

export default function JobsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 py-16 text-center text-sm text-zinc-500">
          Loading WorkPulse Job Marketplace...
        </div>
      }
    >
      <JobsPageContent />
    </Suspense>
  );
}
