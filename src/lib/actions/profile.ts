"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  FreelancerProfileSchema,
  ClientProfileSchema,
  calculateFreelancerProfileCompletion,
  calculateClientProfileCompletion,
} from "@/lib/validations/profile";
import { revalidatePath } from "next/cache";
import { Role, PublicFreelancerProfileData } from "@/types";
import { isValidObjectId } from "@/lib/jobs";

export type ProfileActionResult<T = unknown> = {
  success: boolean;
  profile?: T;
  completion?: { score: number; missing: string[] };
  error?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Server action for authenticated freelancers to update their own profile.
 * Identity and role are strictly derived from the verified server session.
 * Never trusts client-supplied user IDs or role claims.
 */
export async function updateFreelancerProfileAction(
  input: unknown
): Promise<ProfileActionResult> {
  const sessionUser = await getCurrentUser();

  if (!sessionUser) {
    return {
      success: false,
      error: "You must be signed in to update your profile.",
    };
  }

  if (sessionUser.role !== Role.FREELANCER) {
    return {
      success: false,
      error: "Unauthorized: Only freelancer accounts can update freelancer profiles.",
    };
  }

  const parsed = FreelancerProfileSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      const field = issue.path[0];
      if (field) {
        fieldErrors[String(field)] = issue.message;
      }
    });

    return {
      success: false,
      error: "Please correct the errors in the profile form.",
      fieldErrors,
    };
  }

  const {
    name,
    title,
    bio,
    skills,
    hourlyRate,
    experience,
    location,
    languages,
    portfolioUrls,
  } = parsed.data;

  try {
    const updated = await prisma.user.update({
      where: { id: sessionUser.id },
      data: {
        name,
        title: title || null,
        bio: bio || null,
        skills,
        hourlyRate: hourlyRate ?? null,
        experience: experience || null,
        location: location || null,
        languages,
        portfolioUrls,
      },
      select: {
        id: true,
        name: true,
        image: true,
        role: true,
        title: true,
        bio: true,
        skills: true,
        hourlyRate: true,
        experience: true,
        location: true,
        languages: true,
        portfolioUrls: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const completion = calculateFreelancerProfileCompletion(updated);

    revalidatePath("/dashboard/freelancer");
    revalidatePath("/profile/freelancer");
    revalidatePath(`/freelancers/${sessionUser.id}`);
    revalidatePath("/jobs");

    return {
      success: true,
      profile: updated,
      completion,
    };
  } catch (error) {
    console.error("[WorkPulse Update Freelancer Profile Error]:", error);
    return {
      success: false,
      error: "An unexpected database error occurred while updating your profile.",
    };
  }
}

/**
 * Server action for authenticated clients to update their own company profile.
 * Identity and role are strictly derived from the verified server session.
 */
export async function updateClientProfileAction(
  input: unknown
): Promise<ProfileActionResult> {
  const sessionUser = await getCurrentUser();

  if (!sessionUser) {
    return {
      success: false,
      error: "You must be signed in to update your profile.",
    };
  }

  if (sessionUser.role !== Role.CLIENT) {
    return {
      success: false,
      error: "Unauthorized: Only client accounts can update client profiles.",
    };
  }

  const parsed = ClientProfileSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      const field = issue.path[0];
      if (field) {
        fieldErrors[String(field)] = issue.message;
      }
    });

    return {
      success: false,
      error: "Please correct the errors in the profile form.",
      fieldErrors,
    };
  }

  const {
    name,
    companyName,
    companyDescription,
    companyWebsite,
    companyIndustry,
    location,
  } = parsed.data;

  try {
    const updated = await prisma.user.update({
      where: { id: sessionUser.id },
      data: {
        name,
        companyName: companyName || null,
        companyDescription: companyDescription || null,
        companyWebsite: companyWebsite || null,
        companyIndustry: companyIndustry || null,
        location: location || null,
      },
      select: {
        id: true,
        name: true,
        image: true,
        role: true,
        companyName: true,
        companyDescription: true,
        companyWebsite: true,
        companyIndustry: true,
        location: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const completion = calculateClientProfileCompletion(updated);

    revalidatePath("/dashboard/client");
    revalidatePath("/profile/client");
    revalidatePath("/jobs");

    return {
      success: true,
      profile: updated,
      completion,
    };
  } catch (error) {
    console.error("[WorkPulse Update Client Profile Error]:", error);
    return {
      success: false,
      error: "An unexpected database error occurred while updating your profile.",
    };
  }
}

/**
 * Safely fetches a freelancer's public profile by user ID.
 * NEVER exposes email addresses, password hashes, auth tokens, or private data.
 */
export async function getFreelancerPublicProfile(
  userId: string
): Promise<PublicFreelancerProfileData | null> {
  if (!userId || !isValidObjectId(userId)) {
    return null;
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        role: "FREELANCER",
      },
      select: {
        id: true,
        name: true,
        image: true,
        role: true,
        title: true,
        bio: true,
        skills: true,
        hourlyRate: true,
        experience: true,
        location: true,
        languages: true,
        portfolioUrls: true,
        createdAt: true,
        _count: {
          select: {
            freelancerContracts: true,
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      name: user.name || "Freelancer",
      image: user.image,
      role: user.role,
      title: user.title,
      bio: user.bio,
      skills: user.skills || [],
      hourlyRate: user.hourlyRate,
      experience: user.experience,
      location: user.location,
      languages: user.languages || [],
      portfolioUrls: user.portfolioUrls || [],
      createdAt: user.createdAt.toISOString(),
      _count: user._count,
    };
  } catch (error) {
    console.error("[WorkPulse Get Freelancer Public Profile Error]:", error);
    return null;
  }
}

/**
 * Safely fetches a client's public profile by user ID.
 * Excludes email addresses, credentials, and private internal records.
 */
export async function getClientPublicProfile(userId: string) {
  if (!userId || !isValidObjectId(userId)) {
    return null;
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        role: "CLIENT",
      },
      select: {
        id: true,
        name: true,
        image: true,
        role: true,
        companyName: true,
        companyDescription: true,
        companyWebsite: true,
        companyIndustry: true,
        location: true,
        createdAt: true,
        _count: {
          select: {
            jobs: true,
          },
        },
      },
    });

    return user;
  } catch (error) {
    console.error("[WorkPulse Get Client Public Profile Error]:", error);
    return null;
  }
}
