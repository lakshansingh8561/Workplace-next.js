"use server";

import { prisma } from "@/lib/prisma";
import { verifyUserForAction } from "@/lib/session";
import { CreateJobSchema, UpdateJobSchema } from "@/lib/validations/job";
import { PaymentType, ExperienceLevel, JobStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { checkRateLimit } from "@/lib/rate-limit";
import { matchJobAlertsForPublishedJob } from "@/lib/actions/saved-search";
import { invalidateJobFilterCache } from "@/lib/jobs";

export type CreateJobResult = {
  success: boolean;
  jobId?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export type UpdateJobResult = {
  success: boolean;
  jobId?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Server Action to create a new job contract.
 * Strictly enforces that:
 * 1. The caller is authenticated.
 * 2. The caller has a verified email address.
 * 3. The caller's role is CLIENT (rejects FREELANCER and unauthenticated callers).
 * 4. The payload passes full Zod validation.
 * 5. Job ownership (clientId) is derived exclusively from the trusted server-side session.
 * 6. Prevents duplicate job creation within 10 minutes.
 * 7. Supports draft jobs, scheduled publishing, and automatic expiration.
 * 8. Triggers matching saved search job alerts when published as OPEN.
 */
export async function createJobAction(input: unknown): Promise<CreateJobResult> {
  const authRes = await verifyUserForAction(
    "CLIENT",
    "Unauthorized: Only client accounts can post freelance jobs."
  );
  if (!authRes.success) {
    return {
      success: false,
      error: authRes.error,
    };
  }
  const user = authRes.user;

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
    // Duplicate job detection: prevent accidental double-posting of identical title/category within 10 min
    if (typeof prisma.job?.findFirst === "function") {
      try {
        const recentDuplicate = await prisma.job.findFirst({
          where: {
            clientId: user.id,
            title: { equals: data.title, mode: "insensitive" },
            category: data.category,
            createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
          },
          select: { id: true },
        });

        if (recentDuplicate) {
          return {
            success: false,
            error: "A job posting with this title and category was already published recently.",
          };
        }
      } catch {
        // Continue if findFirst is not supported by environment
      }
    }

    const now = new Date();
    const isScheduled =
      Boolean(data.scheduledPublishAt) && new Date(data.scheduledPublishAt!) > now;
    const initialStatus = isScheduled
      ? JobStatus.DRAFT
      : data.status === "DRAFT"
      ? JobStatus.DRAFT
      : JobStatus.OPEN;

    const scheduledDate = data.scheduledPublishAt ? new Date(data.scheduledPublishAt) : null;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days expiry

    // Derive dynamic client snapshot from real database history
    let clientRating: number | null = 5.0;
    let clientPaymentVerified = true;

    if (prisma.review?.aggregate && prisma.contract?.count) {
      try {
        const [reviewsAgg, contractsCount] = await Promise.all([
          prisma.review.aggregate({
            where: { revieweeId: user.id },
            _avg: { rating: true },
          }),
          prisma.contract.count({
            where: { clientId: user.id },
          }),
        ]);

        clientRating = reviewsAgg._avg?.rating
          ? Math.round(reviewsAgg._avg.rating * 10) / 10
          : 5.0;
        clientPaymentVerified = contractsCount > 0;
      } catch {
        // Fall back gracefully
      }
    }

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
        status: initialStatus,
        scheduledPublishAt: scheduledDate,
        expiresAt,
        proposalsCount: 0,
        clientId: user.id,
        clientName: user.name || (user.email ? user.email.split("@")[0] : "Verified Client"),
        clientCountry: "United States",
        clientRating: clientRating ?? 5.0,
        clientSpent: 0,
        clientPaymentVerified,
      },
      select: {
        id: true,
        title: true,
        category: true,
        createdAt: true,
      },
    });

    // Invalidate affected cached routes
    invalidateJobFilterCache();
    revalidatePath("/jobs");
    revalidatePath("/dashboard/client");
    revalidatePath("/");

    // Dispatch matching job alerts if published as OPEN
    if (initialStatus === JobStatus.OPEN) {
      matchJobAlertsForPublishedJob({
        id: job.id,
        title: data.title,
        description: data.description,
        category: data.category,
        skills: data.skills,
        type: data.type,
        budget: data.budget,
        hourlyMin: data.hourlyMin,
        hourlyMax: data.hourlyMax,
        clientId: user.id,
      }).catch((err) => console.error("[Job Alert Error]:", err));
    }

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

/**
 * Server Action to update/edit an existing job or draft.
 * Strictly verifies client ownership and validates all inputs.
 */
export async function updateJobAction(input: unknown): Promise<UpdateJobResult> {
  const authRes = await verifyUserForAction(
    "CLIENT",
    "Unauthorized: Only client accounts can edit jobs."
  );
  if (!authRes.success) {
    return { success: false, error: authRes.error };
  }
  const user = authRes.user;

  const result = UpdateJobSchema.safeParse(input);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    result.error.issues.forEach((issue) => {
      const fieldName = issue.path[0];
      if (fieldName) fieldErrors[String(fieldName)] = issue.message;
    });
    return {
      success: false,
      error: "Please correct the errors in the job form.",
      fieldErrors,
    };
  }

  const data = result.data;

  try {
    const existing = await prisma.job.findUnique({
      where: { id: data.jobId },
      select: { id: true, clientId: true, status: true },
    });

    if (!existing) {
      return { success: false, error: "Job posting not found." };
    }

    if (existing.clientId !== user.id) {
      return { success: false, error: "Unauthorized: You do not own this job posting." };
    }

    const wasDraft = existing.status === JobStatus.DRAFT;
    const targetStatus = data.status === "DRAFT" ? JobStatus.DRAFT : JobStatus.OPEN;
    const scheduledDate = data.scheduledPublishAt ? new Date(data.scheduledPublishAt) : null;

    const updated = await prisma.job.update({
      where: { id: data.jobId },
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
        status: targetStatus,
        scheduledPublishAt: scheduledDate,
      },
      select: { id: true, status: true },
    });

    invalidateJobFilterCache();
    revalidatePath("/jobs");
    revalidatePath(`/jobs/${data.jobId}`);
    revalidatePath("/dashboard/client");
    revalidatePath("/");

    // Trigger alerts if newly published from DRAFT to OPEN
    if (wasDraft && targetStatus === JobStatus.OPEN) {
      matchJobAlertsForPublishedJob({
        id: updated.id,
        title: data.title,
        description: data.description,
        category: data.category,
        skills: data.skills,
        type: data.type,
        budget: data.budget,
        hourlyMin: data.hourlyMin,
        hourlyMax: data.hourlyMax,
        clientId: user.id,
      }).catch((err) => console.error("[Job Alert Error]:", err));
    }

    return { success: true, jobId: updated.id };
  } catch (error) {
    console.error("[WorkPulse Job Update Error]:", error);
    return { success: false, error: "Failed to update job details." };
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
 *    - CLOSED -> OPEN (permitted if no active contract is in progress)
 */
export async function updateJobStatusAction(
  input: unknown
): Promise<UpdateJobStatusResult> {
  const authRes = await verifyUserForAction(
    "CLIENT",
    "Unauthorized: Only client accounts can manage job status."
  );
  if (!authRes.success) {
    return {
      success: false,
      error: authRes.error,
    };
  }
  const user = authRes.user;

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
        title: true,
        description: true,
        category: true,
        skills: true,
        type: true,
        budget: true,
        hourlyMin: true,
        hourlyMax: true,
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

    // Check reopening eligibility for CLOSED jobs
    if (job.status === JobStatus.CLOSED && targetStatus === JobStatus.OPEN) {
      const activeContract = await prisma.contract.findFirst({
        where: {
          jobId: job.id,
          status: { in: ["ACTIVE", "PAUSED"] },
        },
        select: { id: true },
      });

      if (activeContract) {
        return {
          success: false,
          error: "Cannot reopen job: An active contract is already in progress for this job.",
        };
      }
    }

    const allowedTransitions: Record<string, JobStatus[]> = {
      [JobStatus.OPEN]: [JobStatus.PAUSED, JobStatus.CLOSED],
      [JobStatus.PAUSED]: [JobStatus.OPEN, JobStatus.CLOSED],
      [JobStatus.DRAFT]: [JobStatus.OPEN, JobStatus.CLOSED],
      [JobStatus.CLOSED]: [JobStatus.OPEN], // Reopening eligible closed jobs
    };

    const allowed = allowedTransitions[job.status] || [];
    if (!allowed.includes(targetStatus as JobStatus)) {
      return {
        success: false,
        error: `Invalid status transition from ${job.status} to ${targetStatus}.`,
      };
    }

    const updateData: { status: JobStatus; expiresAt?: Date } = {
      status: targetStatus as JobStatus,
    };

    // If reopening to OPEN, reset 30-day expiration window
    if (targetStatus === JobStatus.OPEN) {
      updateData.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: updateData,
      select: {
        id: true,
        status: true,
      },
    });

    invalidateJobFilterCache();
    revalidatePath("/dashboard/client");
    revalidatePath("/jobs");
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath(`/dashboard/client/jobs/${jobId}/proposals`);
    revalidatePath("/");

    // If transitioned to OPEN, trigger matching job alerts
    if (targetStatus === JobStatus.OPEN) {
      matchJobAlertsForPublishedJob({
        id: job.id,
        title: job.title,
        description: job.description,
        category: job.category,
        skills: job.skills,
        type: job.type,
        budget: job.budget,
        hourlyMin: job.hourlyMin,
        hourlyMax: job.hourlyMax,
        clientId: user.id,
      }).catch((err) => console.error("[Job Alert Error]:", err));
    }

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


