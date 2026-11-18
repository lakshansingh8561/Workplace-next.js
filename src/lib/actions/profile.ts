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
    isAvailable,
    visibility,
    portfolioProjects,
    employmentHistory,
    educationHistory,
    certifications,
  } = parsed.data;

  const explicitUrls = (portfolioUrls || []).map((u) => u.trim()).filter(Boolean);
  const projectUrls = (portfolioProjects || [])
    .map((p) => p.projectUrl?.trim())
    .filter((u): u is string => Boolean(u));
  const combinedPortfolioUrls = Array.from(new Set([...explicitUrls, ...projectUrls])).slice(0, 10);

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
        portfolioUrls: combinedPortfolioUrls,
        isAvailable: isAvailable ?? true,
        visibility: visibility || "PUBLIC",
        portfolioProjects: (portfolioProjects || []).map((p) => ({
          id: p.id || crypto.randomUUID(),
          title: p.title,
          description: p.description || null,
          projectUrl: p.projectUrl || null,
          imageUrl: p.imageUrl || null,
          skills: p.skills || [],
        })),
        employmentHistory: (employmentHistory || []).map((e) => ({
          id: e.id || crypto.randomUUID(),
          company: e.company,
          position: e.position,
          location: e.location || null,
          startDate: e.startDate,
          endDate: e.current ? null : e.endDate || null,
          current: Boolean(e.current),
          description: e.description || null,
        })),
        educationHistory: (educationHistory || []).map((ed) => ({
          id: ed.id || crypto.randomUUID(),
          institution: ed.institution,
          degree: ed.degree || null,
          fieldOfStudy: ed.fieldOfStudy || null,
          startYear: ed.startYear || null,
          endYear: ed.endYear || null,
          description: ed.description || null,
        })),
        certifications: (certifications || []).map((c) => ({
          id: c.id || crypto.randomUUID(),
          name: c.name,
          issuer: c.issuer,
          issueDate: c.issueDate || null,
          expiryDate: c.expiryDate || null,
          credentialId: c.credentialId || null,
          credentialUrl: c.credentialUrl || null,
        })),
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
        isAvailable: true,
        visibility: true,
        portfolioProjects: true,
        employmentHistory: true,
        educationHistory: true,
        certifications: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const completion = calculateFreelancerProfileCompletion(updated);

    revalidatePath("/dashboard/freelancer");
    revalidatePath("/profile/freelancer");
    revalidatePath(`/freelancers/${sessionUser.id}`);
    revalidatePath("/freelancers");
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
    const [user, currentUser] = await Promise.all([
      prisma.user.findFirst({
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
          isAvailable: true,
          visibility: true,
          portfolioProjects: true,
          employmentHistory: true,
          educationHistory: true,
          certifications: true,
          createdAt: true,
          _count: {
            select: {
              freelancerContracts: true,
            },
          },
        },
      }),
      getCurrentUser(),
    ]);

    if (!user) {
      return null;
    }

    const isOwner = currentUser?.id === user.id;

    // If profile is set to PRIVATE and visitor is not the owner, hide detailed content
    if (user.visibility === "PRIVATE" && !isOwner) {
      return {
        id: user.id,
        name: user.name || "Freelancer",
        image: null,
        role: user.role,
        title: null,
        bio: null,
        skills: [],
        hourlyRate: null,
        experience: null,
        location: null,
        languages: [],
        portfolioUrls: [],
        isAvailable: false,
        visibility: "PRIVATE",
        portfolioProjects: [],
        employmentHistory: [],
        educationHistory: [],
        certifications: [],
        createdAt: user.createdAt.toISOString(),
        _count: {
          freelancerContracts: 0,
        },
      };
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
      isAvailable: user.isAvailable ?? true,
      visibility: user.visibility || "PUBLIC",
      portfolioProjects: (user.portfolioProjects || []).map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        projectUrl: p.projectUrl,
        imageUrl: p.imageUrl,
        skills: p.skills || [],
      })),
      employmentHistory: (user.employmentHistory || []).map((e) => ({
        id: e.id,
        company: e.company,
        position: e.position,
        location: e.location,
        startDate: e.startDate,
        endDate: e.endDate,
        current: Boolean(e.current),
        description: e.description,
      })),
      educationHistory: (user.educationHistory || []).map((ed) => ({
        id: ed.id,
        institution: ed.institution,
        degree: ed.degree,
        fieldOfStudy: ed.fieldOfStudy,
        startYear: ed.startYear,
        endYear: ed.endYear,
        description: ed.description,
      })),
      certifications: (user.certifications || []).map((c) => ({
        id: c.id,
        name: c.name,
        issuer: c.issuer,
        issueDate: c.issueDate,
        expiryDate: c.expiryDate,
        credentialId: c.credentialId,
        credentialUrl: c.credentialUrl,
      })),
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

/**
 * Server action to update the user's profile image directly in the database.
 */
export async function updateProfilePhotoAction(
  imageUrl: string
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  const sessionUser = await getCurrentUser();

  if (!sessionUser) {
    return {
      success: false,
      error: "You must be signed in to update your profile photo.",
    };
  }

  if (!imageUrl || typeof imageUrl !== "string" || imageUrl.trim().length === 0) {
    return {
      success: false,
      error: "Invalid image URL provided.",
    };
  }

  try {
    const updated = await prisma.user.update({
      where: { id: sessionUser.id },
      data: { image: imageUrl.trim() },
      select: { id: true, image: true },
    });

    revalidatePath("/");
    revalidatePath("/dashboard/client");
    revalidatePath("/dashboard/freelancer");
    revalidatePath("/dashboard/freelancer/proposals");
    revalidatePath("/profile/client");
    revalidatePath("/profile/freelancer");
    revalidatePath(`/clients/${sessionUser.id}`);
    revalidatePath(`/freelancers/${sessionUser.id}`);
    revalidatePath("/jobs");
    revalidatePath("/freelancers");
    revalidatePath("/clients");
    revalidatePath("/contracts");
    revalidatePath("/messages");

    return {
      success: true,
      imageUrl: updated.image || undefined,
    };
  } catch (error) {
    console.error("[WorkPulse Update Profile Photo Action Error]:", error);
    return {
      success: false,
      error: "Failed to update profile photo in database.",
    };
  }
}

/**
 * Server action to remove the user's custom profile image and revert to deterministic avatar.
 */
export async function removeProfilePhotoAction(): Promise<{
  success: boolean;
  error?: string;
}> {
  const sessionUser = await getCurrentUser();

  if (!sessionUser) {
    return {
      success: false,
      error: "You must be signed in to remove your profile photo.",
    };
  }

  try {
    await prisma.user.update({
      where: { id: sessionUser.id },
      data: { image: null },
    });

    revalidatePath("/");
    revalidatePath("/dashboard/client");
    revalidatePath("/dashboard/freelancer");
    revalidatePath("/dashboard/freelancer/proposals");
    revalidatePath("/profile/client");
    revalidatePath("/profile/freelancer");
    revalidatePath(`/clients/${sessionUser.id}`);
    revalidatePath(`/freelancers/${sessionUser.id}`);
    revalidatePath("/jobs");
    revalidatePath("/freelancers");
    revalidatePath("/clients");
    revalidatePath("/contracts");
    revalidatePath("/messages");

    return {
      success: true,
    };
  } catch (error) {
    console.error("[WorkPulse Remove Profile Photo Action Error]:", error);
    return {
      success: false,
      error: "Failed to remove profile photo from database.",
    };
  }
}

