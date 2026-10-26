"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { Role } from "@/types";
import { isValidObjectId } from "@/lib/jobs";
import { revalidatePath } from "next/cache";

export type SavedJobActionResult = {
  success: boolean;
  saved?: boolean;
  error?: string;
  requiresLogin?: boolean;
};

/**
 * Saves a job for the currently authenticated freelancer.
 * Strictly derives user identity and role from the verified server session.
 * Prevents saving non-discoverable jobs (e.g. DRAFT jobs).
 * Guarantees idempotency and concurrency protection via unique compound index.
 */
export async function saveJobAction(jobId: string): Promise<SavedJobActionResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "You must be signed in to save jobs.",
      requiresLogin: true,
    };
  }

  if (user.role !== Role.FREELANCER) {
    return {
      success: false,
      error: "Unauthorized: Only freelancer accounts can save jobs.",
    };
  }

  if (!jobId || typeof jobId !== "string" || !isValidObjectId(jobId)) {
    return {
      success: false,
      error: "Invalid job identifier provided.",
    };
  }

  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, status: true, clientId: true },
    });

    if (!job) {
      return {
        success: false,
        error: "Job not found or has been deleted.",
      };
    }

    // Prevent saving private or draft jobs
    if (job.status === "DRAFT") {
      return {
        success: false,
        error: "Draft jobs are not discoverable and cannot be saved.",
      };
    }

    // Upsert into saved_jobs table (idempotent, concurrency-safe)
    await prisma.savedJob.upsert({
      where: {
        userId_jobId: {
          userId: user.id,
          jobId: job.id,
        },
      },
      create: {
        userId: user.id,
        jobId: job.id,
      },
      update: {},
    });

    revalidatePath("/jobs/saved");
    revalidatePath(`/jobs/${job.id}`);
    revalidatePath("/jobs");

    return {
      success: true,
      saved: true,
    };
  } catch (error) {
    console.error("[WorkPulse Save Job Action Error]:", error);
    return {
      success: false,
      error: "An unexpected error occurred while saving the job.",
    };
  }
}

/**
 * Removes a job from the authenticated freelancer's saved jobs list.
 * Idempotent: safely returns success even if already unsaved.
 */
export async function unsaveJobAction(jobId: string): Promise<SavedJobActionResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "You must be signed in to unsave jobs.",
      requiresLogin: true,
    };
  }

  if (user.role !== Role.FREELANCER) {
    return {
      success: false,
      error: "Unauthorized: Only freelancer accounts can manage saved jobs.",
    };
  }

  if (!jobId || typeof jobId !== "string" || !isValidObjectId(jobId)) {
    return {
      success: false,
      error: "Invalid job identifier provided.",
    };
  }

  try {
    await prisma.savedJob.deleteMany({
      where: {
        userId: user.id,
        jobId,
      },
    });

    revalidatePath("/jobs/saved");
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath("/jobs");

    return {
      success: true,
      saved: false,
    };
  } catch (error) {
    console.error("[WorkPulse Unsave Job Action Error]:", error);
    return {
      success: false,
      error: "An unexpected error occurred while removing the saved job.",
    };
  }
}

/**
 * Toggles the saved state of a job for the authenticated freelancer.
 */
export async function toggleSaveJobAction(jobId: string): Promise<SavedJobActionResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "You must be signed in as a freelancer to save jobs.",
      requiresLogin: true,
    };
  }

  if (user.role !== Role.FREELANCER) {
    return {
      success: false,
      error: "Unauthorized: Only freelancer accounts can save jobs.",
    };
  }

  if (!jobId || typeof jobId !== "string" || !isValidObjectId(jobId)) {
    return {
      success: false,
      error: "Invalid job identifier provided.",
    };
  }

  try {
    const existing = await prisma.savedJob.findUnique({
      where: {
        userId_jobId: {
          userId: user.id,
          jobId,
        },
      },
      select: { id: true },
    });

    if (existing) {
      return await unsaveJobAction(jobId);
    } else {
      return await saveJobAction(jobId);
    }
  } catch (error) {
    console.error("[WorkPulse Toggle Save Job Action Error]:", error);
    return {
      success: false,
      error: "An unexpected error occurred while toggling saved job status.",
    };
  }
}

/**
 * Retrieves the set of saved job IDs for the current authenticated freelancer.
 * Fast, indexed query returning an array of string IDs.
 */
export async function getSavedJobIdsAction(): Promise<{
  success: boolean;
  savedJobIds: string[];
}> {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== Role.FREELANCER) {
      return { success: true, savedJobIds: [] };
    }

    const records = await prisma.savedJob.findMany({
      where: { userId: user.id },
      select: { jobId: true },
    });

    return {
      success: true,
      savedJobIds: records.map((r) => r.jobId),
    };
  } catch (error) {
    console.error("[WorkPulse Get Saved Job IDs Error]:", error);
    return { success: false, savedJobIds: [] };
  }
}
