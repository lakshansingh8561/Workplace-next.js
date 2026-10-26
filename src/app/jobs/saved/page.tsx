import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { Role } from "@/types";
import { Job } from "@/types";
import {
  SavedJobsView,
  SavedJobViewItem,
} from "@/components/jobs/SavedJobsView";

export const metadata: Metadata = {
  title: "Saved Jobs | WorkPulse Marketplace",
  description: "View and manage your saved freelance job opportunities and contracts.",
};

async function SavedJobsContent() {
  await connection();
  const user = await requireRole(Role.FREELANCER, "/jobs/saved");

  // Query saved jobs strictly scoped to authenticated freelancer
  // Exclude non-discoverable jobs (e.g. DRAFT jobs)
  const savedRecords = prisma.savedJob
    ? await prisma.savedJob.findMany({
        where: {
          userId: user.id,
          job: {
            status: { not: "DRAFT" },
          },
        },
        include: {
          job: true,
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const savedJobs: SavedJobViewItem[] = savedRecords.map((r) => ({
    id: r.id,
    jobId: r.jobId,
    savedAt: r.createdAt.toISOString(),
    job: r.job as unknown as Job,
  }));

  return <SavedJobsView initialSavedJobs={savedJobs} />;
}

export default function SavedJobsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16 text-center text-sm text-zinc-500">
          Loading Saved Jobs...
        </div>
      }
    >
      <SavedJobsContent />
    </Suspense>
  );
}
