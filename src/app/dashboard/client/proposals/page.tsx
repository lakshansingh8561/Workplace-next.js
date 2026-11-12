import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { Role } from "@prisma/client";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { ClientAllProposalsView } from "@/components/dashboard/ClientAllProposalsView";

export const metadata: Metadata = {
  title: "All Received Proposals | WorkPulse Client Dashboard",
  description: "Review, negotiate rates, and accept applicant proposals across all your open job contracts.",
};

async function ClientAllProposalsContent() {
  await connection();
  const user = await requireRole(Role.CLIENT, "/login");

  // Fetch all proposals for jobs posted by this client
  const rawProposals = await prisma.proposal.findMany({
    where: {
      job: { clientId: user.id },
    },
    orderBy: { createdAt: "desc" },
    include: {
      job: {
        select: {
          id: true,
          title: true,
          type: true,
          budget: true,
          hourlyMin: true,
          hourlyMax: true,
          status: true,
        },
      },
      freelancer: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          title: true,
          skills: true,
          hourlyRate: true,
          location: true,
        },
      },
    },
  });

  const proposals = rawProposals.map((p) => ({
    id: p.id,
    jobId: p.jobId,
    freelancerId: p.freelancerId,
    coverLetter: p.coverLetter,
    bidAmount: p.bidAmount,
    estimatedDuration: p.estimatedDuration,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    freelancer: p.freelancer,
    job: p.job,
  }));

  return <ClientAllProposalsView initialProposals={proposals} />;
}

export default function ClientAllProposalsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-zinc-500">
          Loading client proposals...
        </div>
      }
    >
      <ClientAllProposalsContent />
    </Suspense>
  );
}

