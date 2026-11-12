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
import { SavedSearchItem } from "@/lib/actions/saved-search";

export const metadata: Metadata = {
  title: "Saved Jobs & Searches | WorkPulse Marketplace",
  description: "View and manage your saved freelance job opportunities, searches, and alert preferences.",
};

async function SavedJobsContent() {
  await connection();
  const user = await requireRole(Role.FREELANCER, "/jobs/saved");

  // Query saved jobs and saved searches concurrently
  const [savedRecords, dbUser] = await Promise.all([
    prisma.savedJob
      ? prisma.savedJob.findMany({
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
      : [],
    prisma.user.findUnique({
      where: { id: user.id },
      select: { savedSearches: true },
    }),
  ]);

  const savedJobs: SavedJobViewItem[] = savedRecords.map((r) => ({
    id: r.id,
    jobId: r.jobId,
    savedAt: r.createdAt.toISOString(),
    job: r.job as unknown as Job,
  }));

  const savedSearches: SavedSearchItem[] = (dbUser?.savedSearches || []).map((s) => ({
    id: s.id,
    name: s.name,
    query: s.query,
    category: s.category,
    type: s.type,
    experience: s.experience,
    skills: s.skills || [],
    minBudget: s.minBudget,
    maxBudget: s.maxBudget,
    alertsEnabled: s.alertsEnabled ?? true,
    createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : new Date().toISOString(),
  }));

  return (
    <SavedJobsView
      initialSavedJobs={savedJobs}
      initialSavedSearches={savedSearches}
    />
  );
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
