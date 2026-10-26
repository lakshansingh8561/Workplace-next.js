import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getFreelancerPublicProfile } from "@/lib/actions/profile";
import { getUserReviewsSummary } from "@/lib/actions/review";
import { PublicFreelancerProfileView } from "@/components/profile/PublicFreelancerProfileView";

interface FreelancerProfilePageProps {
  params: Promise<{
    id: string;
  }>;
}

export async function generateMetadata({
  params,
}: FreelancerProfilePageProps): Promise<Metadata> {
  const { id } = await params;
  const profile = await getFreelancerPublicProfile(id);

  if (!profile) {
    return {
      title: "Freelancer Profile Not Found | WorkPulse",
    };
  }

  const name = profile.name || "Freelancer";
  const title = profile.title ? ` - ${profile.title}` : "";

  return {
    title: `${name}${title} | WorkPulse`,
    description: profile.bio?.slice(0, 160) || `View ${name}'s verified professional freelance profile and skills on WorkPulse.`,
  };
}

async function FreelancerProfileContent({ params }: FreelancerProfilePageProps) {
  await connection();
  const { id } = await params;
  const [profile, reviewsSummary, currentUser] = await Promise.all([
    getFreelancerPublicProfile(id),
    getUserReviewsSummary(id),
    getCurrentUser(),
  ]);

  if (!profile) {
    notFound();
  }

  const isOwner = currentUser?.id === profile.id;

  return (
    <PublicFreelancerProfileView
      profile={profile}
      reviewsSummary={reviewsSummary}
      isOwner={isOwner}
    />
  );
}

export default function FreelancerProfilePage({ params }: FreelancerProfilePageProps) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16 text-center text-sm text-zinc-500">
          Loading Freelancer Profile...
        </div>
      }
    >
      <FreelancerProfileContent params={params} />
    </Suspense>
  );
}
