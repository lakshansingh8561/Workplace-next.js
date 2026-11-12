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
import { ChangePasswordSection } from "@/components/profile/ChangePasswordSection";

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
      isAvailable: true,
      visibility: true,
      portfolioProjects: true,
      employmentHistory: true,
      educationHistory: true,
      certifications: true,
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
    isAvailable: dbUser.isAvailable ?? true,
    visibility: (dbUser.visibility as "PUBLIC" | "PRIVATE") || "PUBLIC",
    portfolioProjects: (dbUser.portfolioProjects || []).map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      projectUrl: p.projectUrl,
      imageUrl: p.imageUrl,
      skills: p.skills || [],
    })),
    employmentHistory: (dbUser.employmentHistory || []).map((e) => ({
      id: e.id,
      company: e.company,
      position: e.position,
      location: e.location,
      startDate: e.startDate,
      endDate: e.endDate,
      current: Boolean(e.current),
      description: e.description,
    })),
    educationHistory: (dbUser.educationHistory || []).map((ed) => ({
      id: ed.id,
      institution: ed.institution,
      degree: ed.degree,
      fieldOfStudy: ed.fieldOfStudy,
      startYear: ed.startYear,
      endYear: ed.endYear,
      description: ed.description,
    })),
    certifications: (dbUser.certifications || []).map((c) => ({
      id: c.id,
      name: c.name,
      issuer: c.issuer,
      issueDate: c.issueDate,
      expiryDate: c.expiryDate,
      credentialId: c.credentialId,
      credentialUrl: c.credentialUrl,
    })),
  };

  return (
    <div className="space-y-10">
      <FreelancerProfileForm initialData={initialData} />
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pb-16">
        <ChangePasswordSection />
      </div>
    </div>
  );
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
