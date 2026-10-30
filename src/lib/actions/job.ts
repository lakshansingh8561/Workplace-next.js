"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { CreateJobSchema } from "@/lib/validations/job";
import { PaymentType, ExperienceLevel, JobStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { checkRateLimit } from "@/lib/rate-limit";

export type CreateJobResult = {
  success: boolean;
  jobId?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Server Action to create a new job contract.
 * Strictly enforces that:
 * 1. The caller is authenticated.
 * 2. The caller's role is CLIENT (rejects FREELANCER and unauthenticated callers).
 * 3. The payload passes full Zod validation.
 * 4. Job ownership (clientId) is derived exclusively from the trusted server-side session.
 */
export async function createJobAction(input: unknown): Promise<CreateJobResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "You must be signed in to post a job.",
    };
  }

  if (user.role !== "CLIENT") {
    return {
      success: false,
      error: "Unauthorized: Only client accounts can post freelance jobs.",
    };
  }

  const result = CreateJobSchema.safeParse(input);

  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    result.error.issues.forEach((issue) => {
      const fieldName = issue.path[0];
      if (fieldName) {
        fieldErrors[String(fieldName)] = issue.message;
      }
    });

    return {
      success: false,
      error: "Please correct the errors in the job form.",
      fieldErrors,
    };
  }

  const data = result.data;

  // Rate limit job creations (max 5 per hour per client)
  const rateLimit = await checkRateLimit(`job-create:${user.id}`, {
    limit: 5,
    windowMs: 3600_000,
  });
  if (!rateLimit.success) {
    return {
      success: false,
      error: "Too many jobs posted recently. Please wait before creating another job.",
    };
  }

  try {
    const job = await prisma.job.create({
      data: {
        title: data.title,
        description: data.description,
        category: data.category,
        skills: data.skills,
        type: data.type as PaymentType,
        budget: data.type === "FIXED" ? data.budget : null,
        hourlyMin: data.type === "HOURLY" ? data.hourlyMin : null,
        hourlyMax: data.type === "HOURLY" ? data.hourlyMax : null,
        duration: data.duration || null,
        experienceLevel: data.experienceLevel as ExperienceLevel,
        status: JobStatus.OPEN,
        proposalsCount: 0,
        clientId: user.id,
        clientName: user.name || (user.email ? user.email.split("@")[0] : "Verified Client"),
        clientCountry: "United States",
        clientRating: 5.0,
        clientSpent: 0,
        clientPaymentVerified: true,
      },
      select: {
        id: true,
        title: true,
        category: true,
        createdAt: true,
      },
    });

    // Invalidate affected cached routes
    revalidatePath("/jobs");
    revalidatePath("/");

    return {
      success: true,
      jobId: job.id,
    };
  } catch (error) {
    console.error(
      "[WorkPulse Job Creation Error]:",
      error instanceof Error ? error.message : "Database error"
    );

    return {
      success: false,
      error: "Failed to publish job. Please verify your connection and try again.",
    };
  }
}

export type UpdateJobStatusResult = {
  success: boolean;
  jobId?: string;
  status?: JobStatus;
  error?: string;
};

/**
 * Server Action to update the status of a job contract.
 * Strictly enforces that:
 * 1. Caller is an authenticated CLIENT.
 * 2. Caller is the verified owner (job.clientId === user.id).
 * 3. Status follows explicit allowed transitions:
 *    - OPEN -> PAUSED, CLOSED
 *    - PAUSED -> OPEN, CLOSED
 *    - DRAFT -> OPEN, CLOSED
 *    - CLOSED jobs cannot be reopened (permanent archive).
 */
export async function updateJobStatusAction(
  input: unknown
): Promise<UpdateJobStatusResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "You must be signed in to manage job postings.",
    };
  }

  if (user.role !== "CLIENT") {
    return {
      success: false,
      error: "Unauthorized: Only client accounts can manage job status.",
    };
  }

  const { UpdateJobStatusSchema } = await import("@/lib/validations/job");
  const result = UpdateJobStatusSchema.safeParse(input);

  if (!result.success) {
    return {
      success: false,
      error: "Invalid job status update request.",
    };
  }

  const { jobId, status: targetStatus } = result.data;

  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        clientId: true,
        status: true,
      },
    });

    if (!job) {
      return {
        success: false,
        error: "Job contract not found.",
      };
    }

    if (job.clientId !== user.id) {
      return {
        success: false,
        error: "Unauthorized: You do not own this job contract.",
      };
    }

    if (job.status === targetStatus) {
      return {
        success: true,
        jobId: job.id,
        status: job.status,
      };
    }

    if (job.status === JobStatus.CLOSED) {
      return {
        success: false,
        error: "Cannot change status. Closed jobs are permanently archived and cannot be reopened.",
      };
    }

    const allowedTransitions: Record<string, JobStatus[]> = {
      [JobStatus.OPEN]: [JobStatus.PAUSED, JobStatus.CLOSED],
      [JobStatus.PAUSED]: [JobStatus.OPEN, JobStatus.CLOSED],
      [JobStatus.DRAFT]: [JobStatus.OPEN, JobStatus.CLOSED],
    };

    const allowed = allowedTransitions[job.status] || [];
    if (!allowed.includes(targetStatus as JobStatus)) {
      return {
        success: false,
        error: `Invalid status transition from ${job.status} to ${targetStatus}.`,
      };
    }

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: { status: targetStatus as JobStatus },
      select: {
        id: true,
        status: true,
      },
    });

    revalidatePath("/dashboard/client");
    revalidatePath("/jobs");
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath(`/dashboard/client/jobs/${jobId}/proposals`);
    revalidatePath("/");

    return {
      success: true,
      jobId: updated.id,
      status: updated.status,
    };
  } catch (error) {
    console.error(
      "[WorkPulse Job Status Update Error]:",
      error instanceof Error ? error.message : "Database error"
    );

    return {
      success: false,
      error: "Failed to update job status. Please try again.",
    };
  }
}

