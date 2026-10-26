import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { Role } from "@/types";
import {
  FreelancerProfileForm,
  FreelancerProfileInitialData,
} from "@/components/profile/FreelancerProfileForm";

export const metadata: Metadata = {
  title: "Freelancer Profile Settings | WorkPulse",
  description: "Manage your professional freelancer title, bio, skills, hourly rate, and portfolio links.",
};

async function FreelancerProfileContent() {
  await connection();
  const sessionUser = await requireRole(Role.FREELANCER, "/profile/freelancer");

  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      name: true,
      image: true,
      title: true,
      bio: true,
      skills: true,
      hourlyRate: true,
      experience: true,
      location: true,
      languages: true,
      portfolioUrls: true,
    },
  });

  if (!dbUser) {
    notFound();
  }

  const initialData: FreelancerProfileInitialData = {
    id: dbUser.id,
    name: dbUser.name || "",
    image: dbUser.image,
    title: dbUser.title,
    bio: dbUser.bio,
    skills: dbUser.skills || [],
    hourlyRate: dbUser.hourlyRate,
    experience: dbUser.experience,
    location: dbUser.location,
    languages: dbUser.languages || [],
    portfolioUrls: dbUser.portfolioUrls || [],
  };

  return <FreelancerProfileForm initialData={initialData} />;
}

export default function FreelancerProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16 text-center text-sm text-zinc-500">
          Loading Freelancer Profile...
        </div>
      }
    >
      <FreelancerProfileContent />
    </Suspense>
  );
}
