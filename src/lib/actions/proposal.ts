"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  SubmitProposalSchema,
  UpdateProposalStatusSchema,
  OBJECT_ID_REGEX,
} from "@/lib/validations/proposal";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { createNotificationSafe } from "@/lib/actions/notification";
import type { ReviewProposalItem } from "@/components/dashboard/ClientProposalReview";
import { checkRateLimit } from "@/lib/rate-limit";

export type SubmitProposalResult = {
  success: boolean;
  proposalId?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export type UpdateProposalStatusResult = {
  success: boolean;
  proposalId?: string;
  contractId?: string;
  status?: string;
  error?: string;
};

export type JobProposalsReviewResult = {
  success: boolean;
  proposals: ReviewProposalItem[];
  error?: string;
};

export type FreelancerProposalSummary = {
  id: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  bidAmount: number;
  estimatedDuration?: string | null;
  createdAt: string;
} | null;

/**
 * Server Action to submit a proposal for a job.
 * Enforces:
 * 1. Authenticated session.
 * 2. Role is FREELANCER (rejects CLIENT and unauthenticated callers).
 * 3. Role onboarding is completed.
 * 4. Cannot submit to own job.
 * 5. Job exists and is currently OPEN.
 * 6. Bid complies with job payment type (FIXED min $5, HOURLY min $3/hr).
 * 7. Enforces single proposal per freelancer per job.
 */
export async function submitProposalAction(
  input: unknown
): Promise<SubmitProposalResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "You must be signed in to submit a proposal.",
    };
  }

  if (user.role !== "FREELANCER") {
    return {
      success: false,
      error: "Unauthorized: Only freelancer accounts can submit proposals.",
    };
  }

  if (!user.roleSelected) {
    return {
      success: false,
      error: "Please complete your role onboarding before submitting proposals.",
    };
  }

  const result = SubmitProposalSchema.safeParse(input);

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
      error: "Please correct the errors in the proposal form.",
      fieldErrors,
    };
  }

  const data = result.data;

  // Rate limit proposal submissions (max 10 per 10 minutes per freelancer)
  const rateLimit = await checkRateLimit(`proposal:${user.id}`, {
    limit: 10,
    windowMs: 600_000,
  });
  if (!rateLimit.success) {
    return {
      success: false,
      error:
        "Too many proposal submissions. Please wait before submitting another proposal.",
    };
  }

  try {
    // 1. Fetch live job from database to verify status and payment type
    const job = await prisma.job.findUnique({
      where: { id: data.jobId },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        clientId: true,
        budget: true,
        hourlyMin: true,
        hourlyMax: true,
      },
    });

    if (!job) {
      return {
        success: false,
        error: "The referenced job contract does not exist or has been removed.",
      };
    }

    if (job.status !== "OPEN") {
      return {
        success: false,
        error: `This job is ${job.status.toLowerCase()} and is not accepting new proposals.`,
      };
    }

    // 2. Reject if the freelancer is somehow the owner of this job
    if (job.clientId && job.clientId === user.id) {
      return {
        success: false,
        error: "You cannot submit a proposal to your own job posting.",
      };
    }

    // 3. Validate payment type consistency against live stored job
    if (job.type === "FIXED") {
      if (data.bidAmount < 5) {
        return {
          success: false,
          error: "Fixed-price proposal bid must be at least $5.",
          fieldErrors: {
            bidAmount: "Fixed-price bid must be at least $5.",
          },
        };
      }
    } else if (job.type === "HOURLY") {
      if (data.bidAmount < 3) {
        return {
          success: false,
          error: "Hourly rate proposal must be at least $3/hr.",
          fieldErrors: {
            bidAmount: "Hourly rate must be at least $3/hr.",
          },
        };
      }
      if (data.bidAmount > 1000) {
        return {
          success: false,
          error: "Hourly rate cannot exceed $1,000/hr.",
          fieldErrors: {
            bidAmount: "Hourly rate cannot exceed $1,000/hr.",
          },
        };
      }
    }

    // 4. Check for existing proposal before attempting insertion
    const existingProposal = await prisma.proposal.findUnique({
      where: {
        jobId_freelancerId: {
          jobId: job.id,
          freelancerId: user.id,
        },
      },
      select: { id: true },
    });

    if (existingProposal) {
      return {
        success: false,
        error: "You have already submitted a proposal for this job contract.",
      };
    }

    // 5. Execute atomic multi-document transaction for proposal creation and count increment
    const proposal = await prisma.$transaction(async (tx) => {
      // Guard against concurrent race conditions inside transaction
      const existingInTx = await tx.proposal.findUnique({
        where: {
          jobId_freelancerId: {
            jobId: job.id,
            freelancerId: user.id,
          },
        },
        select: { id: true },
      });

      if (existingInTx) {
        throw new Error("ALREADY_SUBMITTED");
      }

      // Re-verify that job is still OPEN within transaction
      const freshJob = await tx.job.findUnique({
        where: { id: job.id },
        select: { status: true },
      });

      if (!freshJob || freshJob.status !== "OPEN") {
        throw new Error("JOB_NOT_OPEN");
      }

      const newProposal = await tx.proposal.create({
        data: {
          jobId: job.id,
          freelancerId: user.id,
          coverLetter: data.coverLetter,
          bidAmount: data.bidAmount,
          estimatedDuration: data.estimatedDuration || null,
          status: "PENDING",
        },
        select: {
          id: true,
        },
      });

      await tx.job.update({
        where: { id: job.id },
        data: {
          proposalsCount: {
            increment: 1,
          },
        },
      });

      return newProposal;
    });

    // Notify the client that a new proposal has arrived
    if (job.clientId) {
      await createNotificationSafe({
        userId: job.clientId,
        type: "CONTRACT_STATUS",
        title: "New Proposal Received",
        message: `${user.name || "A freelancer"} submitted a proposal of $${data.bidAmount} for "${job.title}".`,
        link: `/dashboard/client/jobs/${job.id}/proposals`,
      });
    }

    // Revalidate affected views
    revalidatePath("/jobs");
    revalidatePath(`/jobs/${job.id}`);
    revalidatePath(`/dashboard/client/jobs/${job.id}/proposals`);

    return {
      success: true,
      proposalId: proposal.id,
    };
  } catch (error) {
    if (
      (error instanceof Error && error.message === "ALREADY_SUBMITTED") ||
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002")
    ) {
      return {
        success: false,
        error: "You have already submitted a proposal for this job contract.",
      };
    }

    if (error instanceof Error && error.message === "JOB_NOT_OPEN") {
      return {
        success: false,
        error: "This job is no longer accepting new proposals.",
      };
    }

    console.error(
      "[WorkPulse Proposal Action Error]:",
      error instanceof Error ? error.message : "Database error"
    );

    return {
      success: false,
      error:
        "Failed to submit proposal. Please verify your connection and try again.",
    };
  }
}

/**
 * Server Action for client owners to accept or reject a proposal.
 * Strictly verifies that:
 * 1. Caller is an authenticated CLIENT.
 * 2. Proposal exists and is currently in PENDING state.
 * 3. Caller is the verified owner (job.clientId === user.id).
 * 4. Status transition is strictly to ACCEPTED or REJECTED.
 */
export async function updateProposalStatusAction(
  input: unknown
): Promise<UpdateProposalStatusResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "You must be signed in to manage proposals.",
    };
  }

  if (user.role !== "CLIENT") {
    return {
      success: false,
      error: "Unauthorized: Only client accounts can manage proposals.",
    };
  }

  const result = UpdateProposalStatusSchema.safeParse(input);

  if (!result.success) {
    return {
      success: false,
      error: "Invalid proposal status update request.",
    };
  }

  const { proposalId, status } = result.data;

  try {
    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            type: true,
            clientId: true,
            status: true,
          },
        },
      },
    });

    if (!proposal) {
      return {
        success: false,
        error: "Proposal not found.",
      };
    }

    if (!proposal.job || proposal.job.clientId !== user.id) {
      return {
        success: false,
        error: "Unauthorized: You do not own the job associated with this proposal.",
      };
    }

    if (proposal.status !== "PENDING") {
      return {
        success: false,
        error: `Cannot update proposal. It is already marked as ${proposal.status.toLowerCase()}.`,
      };
    }

    if (status === "ACCEPTED") {
      // Pre-fetch competing pending proposals to dispatch single-winner decline notifications
      const competingProposals = await prisma.proposal.findMany({
        where: {
          jobId: proposal.job.id,
          id: { not: proposal.id },
          status: "PENDING",
        },
        select: { id: true, freelancerId: true },
      });

      // Execute multi-document atomic transaction for proposal acceptance & contract binding
      const txResult = await prisma.$transaction(async (tx) => {
        // 1. Verify proposal within transaction to guard against concurrent acceptance
        const freshProposal = await tx.proposal.findUnique({
          where: { id: proposalId },
          include: {
            job: {
              select: {
                id: true,
                title: true,
                type: true,
                clientId: true,
                status: true,
              },
            },
          },
        });

        if (!freshProposal || freshProposal.status !== "PENDING") {
          throw new Error("Proposal is no longer pending review.");
        }

        // 2. Ensure job is still OPEN and has not already formed a contract
        if (freshProposal.job.status !== "OPEN") {
          throw new Error(
            `Cannot accept proposal. This job contract is already ${freshProposal.job.status.toLowerCase()}.`
          );
        }

        // 3. Atomically update job status to CLOSED first.
        // In MongoDB, this immediately acquires an exclusive write lock on the Job document,
        // causing any concurrent transaction attempting to accept a competing proposal to abort
        // via WriteConflict or encounter a closed job status.
        await tx.job.update({
          where: { id: freshProposal.job.id },
          data: { status: "CLOSED" },
        });

        // 4. Double-check that no contract has already been formed for this job
        const existingJobContract = await tx.contract.findFirst({
          where: { jobId: freshProposal.job.id },
        });

        if (existingJobContract) {
          throw new Error(
            "A contract has already been awarded and formed for this job."
          );
        }

        // 5. Prevent duplicate contract creation on this proposal
        const existingContract = await tx.contract.findUnique({
          where: { proposalId: freshProposal.id },
        });

        if (existingContract) {
          throw new Error(
            "A contract has already been formed for this proposal."
          );
        }

        // 6. Mark the accepted proposal
        const acceptedProp = await tx.proposal.update({
          where: { id: freshProposal.id },
          data: { status: "ACCEPTED" },
        });

        // 7. Form formal Contract record
        const isHourly = freshProposal.job.type === "HOURLY";
        const newContract = await tx.contract.create({
          data: {
            proposalId: freshProposal.id,
            jobId: freshProposal.job.id,
            clientId: user.id,
            freelancerId: freshProposal.freelancerId,
            title: freshProposal.job.title,
            type: freshProposal.job.type,
            totalAmount: isHourly ? null : freshProposal.bidAmount,
            hourlyRate: isHourly ? freshProposal.bidAmount : null,
            terms: freshProposal.estimatedDuration
              ? `Estimated Project Duration: ${freshProposal.estimatedDuration}`
              : "Standard WorkPulse Freelance Terms",
            status: "ACTIVE",
            startDate: new Date(),
          },
        });

        // 6. Single-winner: Automatically decline all other competing pending proposals
        await tx.proposal.updateMany({
          where: {
            jobId: freshProposal.job.id,
            id: { not: freshProposal.id },
            status: "PENDING",
          },
          data: { status: "REJECTED" },
        });

        return {
          proposal: acceptedProp,
          contract: newContract,
        };
      });

      // In-app Notification for the winning freelancer
      await createNotificationSafe({
        userId: proposal.freelancerId,
        type: "CONTRACT_STATUS",
        title: "Proposal Accepted! 🎉",
        message: `Your proposal for "${proposal.job.title}" has been accepted! Contract #${txResult.contract.id.slice(-6)} is now active.`,
        link: `/contracts/${txResult.contract.id}`,
      });

      // In-app Notifications for competing pending freelancers automatically declined
      for (const comp of competingProposals) {
        await createNotificationSafe({
          userId: comp.freelancerId,
          type: "CONTRACT_STATUS",
          title: "Proposal Update",
          message: `Another proposal was selected for "${proposal.job.title}". Thank you for your application!`,
          link: `/jobs/${proposal.job.id}`,
        });
      }

      revalidatePath("/dashboard/client");
      revalidatePath("/dashboard/freelancer");
      revalidatePath("/contracts");
      revalidatePath(`/contracts/${txResult.contract.id}`);
      revalidatePath(`/jobs/${proposal.job.id}`);
      revalidatePath(`/dashboard/client/jobs/${proposal.job.id}/proposals`);

      return {
        success: true,
        proposalId: txResult.proposal.id,
        contractId: txResult.contract.id,
        status: "ACCEPTED",
      };
    } else {
      // Declining proposal (REJECTED)
      const updated = await prisma.proposal.update({
        where: { id: proposalId },
        data: { status: "REJECTED" },
        select: {
          id: true,
          status: true,
          jobId: true,
        },
      });

      // In-app Notification for the declined freelancer
      await createNotificationSafe({
        userId: proposal.freelancerId,
        type: "CONTRACT_STATUS",
        title: "Proposal Update",
        message: `Your proposal for "${proposal.job.title}" was declined by the client.`,
        link: `/jobs/${proposal.job.id}`,
      });

      revalidatePath(`/jobs/${updated.jobId}`);
      revalidatePath(`/dashboard/client/jobs/${updated.jobId}/proposals`);
      revalidatePath("/dashboard/freelancer");

      return {
        success: true,
        proposalId: updated.id,
        status: updated.status,
      };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "";

    // 1. Identify recognized MongoDB/Prisma transaction write conflict or deadlock
    const isWriteConflict =
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034") ||
      /write\s*conflict|deadlock|transienttransactionerror/i.test(errorMsg);

    if (isWriteConflict) {
      console.warn(
        "[WorkPulse Proposal Action] Transaction write conflict detected during proposal acceptance."
      );
      return {
        success: false,
        error:
          "This proposal is being processed, or another proposal may already have been accepted. Refresh the page and check the latest status.",
      };
    }

    // 2. Preserve safe, informative domain validation errors thrown intentionally
    const isDomainError =
      errorMsg.startsWith("Cannot accept proposal") ||
      errorMsg.startsWith("A contract has already been") ||
      errorMsg === "Proposal is no longer pending review." ||
      errorMsg === "Proposal not found." ||
      errorMsg.startsWith("Unauthorized:");

    if (isDomainError) {
      return {
        success: false,
        error: errorMsg,
      };
    }

    // 3. Handle duplicate constraint errors (e.g. P2002 on unique proposal or contract)
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        success: false,
        error: "A contract has already been awarded and formed for this job.",
      };
    }

    // 4. Fallback for ordinary unrelated database errors (do not leak raw internals or misclassify as concurrency conflict)
    console.error(
      "[WorkPulse Status Update Error]:",
      error instanceof Error ? error.message : "Database error"
    );

    return {
      success: false,
      error: "Failed to update proposal status. Please try again.",
    };
  }
}

/**
 * Checks if the currently authenticated freelancer has already submitted a proposal
 * for the specified job. Returns proposal summary if found, or null.
 */
export async function getFreelancerProposalForJob(
  jobId: string
): Promise<FreelancerProposalSummary> {
  if (!jobId || !OBJECT_ID_REGEX.test(jobId)) {
    return null;
  }

  const user = await getCurrentUser();
  if (!user || user.role !== "FREELANCER") {
    return null;
  }

  try {
    const proposal = await prisma.proposal.findUnique({
      where: {
        jobId_freelancerId: {
          jobId,
          freelancerId: user.id,
        },
      },
      select: {
        id: true,
        status: true,
        bidAmount: true,
        estimatedDuration: true,
        createdAt: true,
      },
    });

    if (!proposal) return null;

    return {
      id: proposal.id,
      status: proposal.status as "PENDING" | "ACCEPTED" | "REJECTED",
      bidAmount: proposal.bidAmount,
      estimatedDuration: proposal.estimatedDuration,
      createdAt: proposal.createdAt.toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Fetches all proposals submitted for a specific job, formatted for client review.
 * Strictly enforces that:
 * 1. Caller is authenticated via verified server session.
 * 2. Caller has the CLIENT role.
 * 3. The requested job exists and caller is the verified owner (job.clientId === user.id).
 * Never trusts a client-supplied clientId.
 */
export async function getJobProposalsForReview(
  jobId: string
): Promise<JobProposalsReviewResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      proposals: [],
      error: "Authentication required to review candidate proposals.",
    };
  }

  if (user.role !== "CLIENT") {
    return {
      success: false,
      proposals: [],
      error: "Unauthorized: Only client accounts can review candidate proposals.",
    };
  }

  if (!jobId || !OBJECT_ID_REGEX.test(jobId)) {
    return {
      success: false,
      proposals: [],
      error: "Invalid job identifier format.",
    };
  }

  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, clientId: true },
    });

    if (!job) {
      return {
        success: false,
        proposals: [],
        error: "Job posting not found.",
      };
    }

    if (job.clientId !== user.id) {
      return {
        success: false,
        proposals: [],
        error: "Unauthorized: You do not own this job posting and cannot view candidate proposals.",
      };
    }

    const rawProposals = await prisma.proposal.findMany({
      where: { jobId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        jobId: true,
        freelancerId: true,
        coverLetter: true,
        bidAmount: true,
        estimatedDuration: true,
        status: true,
        createdAt: true,
        freelancer: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            title: true,
            skills: true,
            hourlyRate: true,
            location: true,
            createdAt: true,
          },
        },
      },
    });

    const proposals: ReviewProposalItem[] = rawProposals.map((p) => {
      const f = p.freelancer as {
        id: string;
        name: string | null;
        email: string | null;
        image: string | null;
        title?: string | null;
        skills?: string[];
        hourlyRate?: number | null;
        location?: string | null;
        createdAt?: Date;
      };

      return {
        id: p.id,
        jobId: p.jobId,
        freelancerId: p.freelancerId,
        coverLetter: p.coverLetter,
        bidAmount: p.bidAmount,
        estimatedDuration: p.estimatedDuration,
        status: p.status as "PENDING" | "ACCEPTED" | "REJECTED",
        createdAt: p.createdAt.toISOString(),
        freelancer: {
          id: f.id,
          name: f.name,
          email: f.email,
          image: f.image,
          title: f.title,
          skills: f.skills || [],
          hourlyRate: f.hourlyRate,
          location: f.location,
          createdAt: f.createdAt?.toISOString(),
        },
      };
    });

    return {
      success: true,
      proposals,
    };
  } catch (error) {
    console.error("[WorkPulse Get Job Proposals Error]:", error);
    return {
      success: false,
      proposals: [],
      error: "An unexpected database error occurred while fetching candidate proposals.",
    };
  }
}

export interface FreelancerProposalItem {
  id: string;
  bidAmount: number;
  estimatedDuration?: string | null;
  coverLetter: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  createdAt: string;
  job: {
    id: string;
    title: string;
    category: string;
    type: string;
    budget?: number | null;
    hourlyMin?: number | null;
    hourlyMax?: number | null;
    status: string;
    clientName?: string | null;
    clientCountry?: string | null;
    isArchived: boolean;
  };
  contract?: {
    id: string;
    status: string;
  } | null;
}

export interface FreelancerProposalsCounts {
  all: number;
  pending: number;
  accepted: number;
  rejected: number;
}

export interface FreelancerProposalsResult {
  proposals: FreelancerProposalItem[];
  counts: FreelancerProposalsCounts;
  totalProposals: number;
  currentPage: number;
  totalPages: number;
}

/**
 * Retrieves the authenticated freelancer's submitted proposals.
 * Strictly scoped to session user. Supports status filters, search, and pagination.
 * Preserves access across all job statuses (including CLOSED).
 */
export async function getFreelancerProposals(params: {
  status?: string;
  search?: string;
  page?: number | string;
  limit?: number | string;
}): Promise<FreelancerProposalsResult> {
  const user = await getCurrentUser();

  if (!user || user.role !== "FREELANCER") {
    return {
      proposals: [],
      counts: { all: 0, pending: 0, accepted: 0, rejected: 0 },
      totalProposals: 0,
      currentPage: 1,
      totalPages: 1,
    };
  }

  try {
    // 1. Calculate live status counts strictly for the authenticated freelancer
    const [totalAll, totalPending, totalAccepted, totalRejected] = await Promise.all([
      prisma.proposal.count({ where: { freelancerId: user.id } }),
      prisma.proposal.count({ where: { freelancerId: user.id, status: "PENDING" } }),
      prisma.proposal.count({ where: { freelancerId: user.id, status: "ACCEPTED" } }),
      prisma.proposal.count({ where: { freelancerId: user.id, status: "REJECTED" } }),
    ]);

    // 2. Build filtered where clause
    const where: Prisma.ProposalWhereInput = {
      freelancerId: user.id,
    };

    const normalizedStatus = params.status?.toUpperCase();
    if (
      normalizedStatus &&
      normalizedStatus !== "ALL" &&
      ["PENDING", "ACCEPTED", "REJECTED"].includes(normalizedStatus)
    ) {
      where.status = normalizedStatus as "PENDING" | "ACCEPTED" | "REJECTED";
    }

    const searchQuery = params.search?.trim();
    if (searchQuery) {
      where.OR = [
        { coverLetter: { contains: searchQuery, mode: "insensitive" } },
        {
          job: {
            title: { contains: searchQuery, mode: "insensitive" },
          },
        },
      ];
    }

    const page = Math.max(1, parseInt(String(params.page || "1"), 10) || 1);
    const limit = Math.max(1, Math.min(50, parseInt(String(params.limit || "10"), 10) || 10));
    const skip = (page - 1) * limit;

    const [filteredTotal, rawProposals] = await Promise.all([
      prisma.proposal.count({ where }),
      prisma.proposal.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          bidAmount: true,
          estimatedDuration: true,
          coverLetter: true,
          status: true,
          createdAt: true,
          job: {
            select: {
              id: true,
              title: true,
              category: true,
              type: true,
              budget: true,
              hourlyMin: true,
              hourlyMax: true,
              status: true,
              clientName: true,
              clientCountry: true,
            },
          },
          contract: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      }),
    ]);

    const proposals: FreelancerProposalItem[] = rawProposals.map((p) => {
      const hasJob = Boolean(p.job && p.job.id);
      return {
        id: p.id,
        bidAmount: p.bidAmount,
        estimatedDuration: p.estimatedDuration,
        coverLetter: p.coverLetter,
        status: p.status as "PENDING" | "ACCEPTED" | "REJECTED",
        createdAt: p.createdAt.toISOString(),
        job: hasJob
          ? {
              id: p.job.id,
              title: p.job.title,
              category: p.job.category,
              type: p.job.type,
              budget: p.job.budget,
              hourlyMin: p.job.hourlyMin,
              hourlyMax: p.job.hourlyMax,
              status: p.job.status,
              clientName: p.job.clientName,
              clientCountry: p.job.clientCountry,
              isArchived: false,
            }
          : {
              id: "",
              title: "Job Archived",
              category: "Archived",
              type: "FIXED",
              budget: null,
              hourlyMin: null,
              hourlyMax: null,
              status: "CLOSED",
              clientName: null,
              clientCountry: null,
              isArchived: true,
            },
        contract: p.contract
          ? {
              id: p.contract.id,
              status: p.contract.status,
            }
          : null,
      };
    });

    return {
      proposals,
      counts: {
        all: totalAll,
        pending: totalPending,
        accepted: totalAccepted,
        rejected: totalRejected,
      },
      totalProposals: filteredTotal,
      currentPage: page,
      totalPages: Math.ceil(filteredTotal / limit) || 1,
    };
  } catch (error) {
    console.error("[WorkPulse Get Freelancer Proposals Error]:", error);
    return {
      proposals: [],
      counts: { all: 0, pending: 0, accepted: 0, rejected: 0 },
      totalProposals: 0,
      currentPage: 1,
      totalPages: 1,
    };
  }
}
