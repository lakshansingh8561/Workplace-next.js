import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { getClientPublicProfile } from "@/lib/actions/profile";
import { getUserReviewsSummary } from "@/lib/actions/review";
import { getDeterministicAvatar } from "@/lib/avatar-map";
import {
  PublicClientProfileView,
  PublicClientProfileData,
  PublicClientJobItem,
} from "@/components/profile/PublicClientProfileView";

interface ClientProfilePageProps {
  params: Promise<{
    id: string;
  }>;
}

export async function generateMetadata({
  params,
}: ClientProfilePageProps): Promise<Metadata> {
  const { id } = await params;
  const client = await getClientPublicProfile(id);

  if (!client) {
    return {
      title: "Client Profile Not Found | WorkPulse",
    };
  }

  const displayName = client.companyName || client.name || "Hiring Client";
  const desc =
    client.companyDescription?.slice(0, 160) ||
    `Explore ${displayName}'s company profile, active job openings, and verified client history on WorkPulse.`;

  return {
    title: `${displayName} - Client Company Profile | WorkPulse`,
    description: desc,
  };
}

async function ClientProfileContent({ params }: ClientProfilePageProps) {
  await connection();
  const { id } = await params;

  const [rawClient, reviewsSummary, currentUser, openJobsRaw, completedContractsCount, totalContractsCount] =
    await Promise.all([
      getClientPublicProfile(id),
      getUserReviewsSummary(id),
      getCurrentUser(),
      prisma.job.findMany({
        where: {
          clientId: id,
          status: "OPEN",
        },
        select: {
          id: true,
          title: true,
          description: true,
          category: true,
          skills: true,
          type: true,
          budget: true,
          hourlyMin: true,
          hourlyMax: true,
          duration: true,
          experienceLevel: true,
          proposalsCount: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.contract.count({
        where: { clientId: id, status: "COMPLETED" },
      }),
      prisma.contract.count({
        where: { clientId: id },
      }),
    ]);

  if (!rawClient) {
    notFound();
  }

  const isOwner = currentUser?.id === rawClient.id;
  const totalJobsCount = rawClient._count.jobs;
  const hireRate = totalJobsCount > 0 ? Math.round((totalContractsCount / totalJobsCount) * 100) : 0;
  const paymentVerified = totalContractsCount > 0;

  const openJobs: PublicClientJobItem[] = openJobsRaw.map((j) => ({
    id: j.id,
    title: j.title,
    description: j.description,
    category: j.category,
    skills: j.skills || [],
    type: j.type as "FIXED" | "HOURLY",
    budget: j.budget,
    hourlyMin: j.hourlyMin,
    hourlyMax: j.hourlyMax,
    duration: j.duration,
    experienceLevel: String(j.experienceLevel),
    proposalsCount: j.proposalsCount,
    createdAt: j.createdAt.toISOString(),
  }));

  const avatarUrl = getDeterministicAvatar(
    {
      id: rawClient.id,
      name: rawClient.companyName || rawClient.name,
      role: "CLIENT",
      image: rawClient.image,
    },
    "CLIENT"
  );

  const clientData: PublicClientProfileData = {
    id: rawClient.id,
    name: rawClient.name || "Client",
    image: avatarUrl,
    companyName: rawClient.companyName || null,
    companyDescription: rawClient.companyDescription || null,
    companyIndustry: rawClient.companyIndustry || null,
    companyWebsite: rawClient.companyWebsite || null,
    location: rawClient.location || null,
    createdAt: rawClient.createdAt.toISOString(),
    totalJobsCount,
    openJobs,
    completedContractsCount,
    totalHiresCount: totalContractsCount,
    hireRate,
    paymentVerified,
  };

  return (
    <PublicClientProfileView
      client={clientData}
      reviewsSummary={reviewsSummary}
      isOwner={isOwner}
      currentUserRole={currentUser?.role}
      currentUserId={currentUser?.id}
    />
  );
}

export default function ClientProfilePage({ params }: ClientProfilePageProps) {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-16">
      <Suspense
        fallback={
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16 text-center text-sm text-zinc-500">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent mb-3" />
            <p>Loading Company Profile...</p>
          </div>
        }
      >
        <ClientProfileContent params={params} />
      </Suspense>
    </main>
  );
}

