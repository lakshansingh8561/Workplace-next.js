import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { Role } from "@/types";
import {
  ClientProfileForm,
  ClientProfileInitialData,
} from "@/components/profile/ClientProfileForm";
import { getUserReviewsSummary } from "@/lib/actions/review";
import { PublicReviewsList } from "@/components/reviews/PublicReviewsList";

export const metadata: Metadata = {
  title: "Client Profile Settings | WorkPulse",
  description: "Manage your company profile, mission statement, official website, and industry.",
};

async function ClientProfileContent() {
  await connection();
  const sessionUser = await requireRole(Role.CLIENT, "/profile/client");

  const [dbUser, reviewsSummary] = await Promise.all([
    prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: {
        id: true,
        name: true,
        image: true,
        companyName: true,
        companyDescription: true,
        companyWebsite: true,
        companyIndustry: true,
        location: true,
      },
    }),
    getUserReviewsSummary(sessionUser.id),
  ]);

  if (!dbUser) {
    notFound();
  }

  const initialData: ClientProfileInitialData = {
    id: dbUser.id,
    name: dbUser.name || "",
    image: dbUser.image,
    companyName: dbUser.companyName,
    companyDescription: dbUser.companyDescription,
    companyWebsite: dbUser.companyWebsite,
    companyIndustry: dbUser.companyIndustry,
    location: dbUser.location,
  };

  return (
    <div className="space-y-10">
      <ClientProfileForm initialData={initialData} />
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pb-16">
        <PublicReviewsList
          reviews={reviewsSummary.reviews}
          averageRating={reviewsSummary.averageRating}
          totalReviews={reviewsSummary.totalReviews}
          entityName={dbUser.companyName || dbUser.name || "Company"}
          entityType="Client"
        />
      </div>
    </div>
  );
}

export default function ClientProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16 text-center text-sm text-zinc-500">
          Loading Client Profile...
        </div>
      }
    >
      <ClientProfileContent />
    </Suspense>
  );
}
