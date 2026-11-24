"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser, verifyUserForAction } from "@/lib/session";
import {
  SubmitProposalSchema,
  UpdateProposalStatusSchema,
  OBJECT_ID_REGEX,
} from "@/lib/validations/proposal";
import { revalidatePath } from "next/cache";
import { Prisma, Role, NotificationType } from "@prisma/client";
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
  conversationId?: string;
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
 * 2. Verified email address.
 * 3. Role is FREELANCER (rejects CLIENT and unauthenticated callers).
 * 4. Role onboarding is completed.
 * 5. Cannot submit to own job.
 * 6. Job exists and is currently OPEN.
 * 7. Bid complies with job payment type (FIXED min $5, HOURLY min $3/hr).
 * 8. Enforces single proposal per freelancer per job.
 */
export async function submitProposalAction(
  input: unknown
): Promise<SubmitProposalResult> {
  const authRes = await verifyUserForAction(
    "FREELANCER",
    "Unauthorized: Only freelancer accounts can submit proposals."
  );
  if (!authRes.success) {
    return {
      success: false,
      error: authRes.error,
    };
  }
  const user = authRes.user;

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
        idempotencyKey: `proposal:${proposal.id}:submitted`,
      });
    }

    // Revalidate affected views
    revalidatePath("/jobs");
    revalidatePath(`/jobs/${job.id}`);
    revalidatePath(`/dashboard/client/jobs/${job.id}/proposals`);
    revalidatePath("/dashboard/freelancer");
    revalidatePath("/dashboard/freelancer/proposals");
    revalidatePath("/dashboard/client");
    revalidatePath("/dashboard/client/proposals");

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
  const authRes = await verifyUserForAction(
    "CLIENT",
    "Unauthorized: Only client accounts can manage proposals."
  );
  if (!authRes.success) {
    return {
      success: false,
      error: authRes.error,
    };
  }
  const user = authRes.user;

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
        freelancer: {
          select: {
            id: true,
            name: true,
            role: true,
            roleSelected: true,
          },
        },
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

    // Verify freelancer eligibility if available
    if (
      proposal.freelancer &&
      (proposal.freelancer.role !== "FREELANCER" ||
        proposal.freelancer.roleSelected === false)
    ) {
      return {
        success: false,
        error: "The freelancer associated with this proposal is no longer eligible.",
      };
    }

    if (!["PENDING", "UNDER_REVIEW", "SHORTLISTED"].includes(proposal.status)) {
      return {
        success: false,
        error: `Cannot update proposal. It is already marked as ${proposal.status.toLowerCase()}.`,
      };
    }

    if (status === "UNDER_REVIEW" || status === "SHORTLISTED") {
      await prisma.proposal.update({
        where: { id: proposalId },
        data: { status },
      });

      await createNotificationSafe({
        userId: proposal.freelancerId,
        type: NotificationType.JOB_ALERT,
        title: status === "SHORTLISTED" ? "Proposal Shortlisted! ⭐" : "Proposal Under Review 📋",
        message: `Your proposal for "${proposal.job.title}" has been marked as ${status.toLowerCase().replace("_", " ")}.`,
        link: `/dashboard/freelancer/proposals`,
      });

      revalidatePath(`/dashboard/client/jobs/${proposal.job.id}/proposals`);
      revalidatePath("/dashboard/client");
      revalidatePath("/dashboard/client/proposals");
      revalidatePath("/dashboard/freelancer");
      revalidatePath("/dashboard/freelancer/proposals");
      return { success: true, proposalId, status };
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

        // 8. Single-winner: Automatically decline all other competing pending proposals
        await tx.proposal.updateMany({
          where: {
            jobId: freshProposal.job.id,
            id: { not: freshProposal.id },
            status: "PENDING",
          },
          data: { status: "REJECTED" },
        });

        // 9. Atomic conversation conversion or creation:
        // Upgrade existing conversation to CONTRACT or create new CONTRACT conversation
        let conversation = null;
        if (tx.conversation.findUnique) {
          conversation = await tx.conversation.findUnique({
            where: {
              jobId_freelancerId: {
                jobId: freshProposal.job.id,
                freelancerId: freshProposal.freelancerId,
              },
            },
            select: { id: true, type: true, contractId: true },
          });
        }
        if (!conversation && tx.conversation.findFirst) {
          conversation = await tx.conversation.findFirst({
            where: {
              clientId: user.id,
              freelancerId: freshProposal.freelancerId,
            },
            orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
            select: { id: true, type: true, contractId: true },
          });
        }

        if (conversation) {
          // Existing conversation exists between this pair: upgrade to CONTRACT and bind newly formed contract
          conversation = await tx.conversation.update({
            where: { id: conversation.id },
            data: {
              contractId: newContract.id,
              jobId: freshProposal.job.id,
              type: "CONTRACT",
            },
            select: { id: true, type: true, contractId: true },
          });
        } else {
          // No prior conversation: establish new CONTRACT conversation thread
          conversation = await tx.conversation.create({
            data: {
              contractId: newContract.id,
              jobId: freshProposal.job.id,
              clientId: user.id,
              freelancerId: freshProposal.freelancerId,
              type: "CONTRACT",
              lastMessageAt: new Date(),
            },
            select: { id: true, type: true, contractId: true },
          });
        }

        return {
          proposal: acceptedProp,
          contract: newContract,
          conversation,
        };
      });

      const freelancerName = proposal.freelancer?.name || "the freelancer";

      // In-app Notification for the winning freelancer (Proposal Accepted / Contract Created)
      await createNotificationSafe({
        userId: proposal.freelancerId,
        type: "CONTRACT_STATUS",
        title: "Proposal Accepted! 🎉",
        message: `Your proposal for "${proposal.job.title}" has been accepted! Contract #${txResult.contract.id.slice(-6)} is now active.`,
        link: `/contracts/${txResult.contract.id}`,
        idempotencyKey: `contract:${txResult.contract.id}:accepted:freelancer`,
      });

      // In-app Notification for the hiring client (Freelancer Hired / Contract Created)
      await createNotificationSafe({
        userId: user.id,
        type: "CONTRACT_STATUS",
        title: "Freelancer Hired! 🚀",
        message: `You hired ${freelancerName} for "${proposal.job.title}". Contract #${txResult.contract.id.slice(-6)} is now active.`,
        link: `/contracts/${txResult.contract.id}`,
        idempotencyKey: `contract:${txResult.contract.id}:created:client`,
      });

      // In-app Notifications for competing pending freelancers automatically declined
      for (const comp of competingProposals) {
        await createNotificationSafe({
          userId: comp.freelancerId,
          type: "CONTRACT_STATUS",
          title: "Proposal Update",
          message: `Another proposal was selected for "${proposal.job.title}". Thank you for your application!`,
          link: `/jobs/${proposal.job.id}`,
          idempotencyKey: `proposal:${comp.id}:declined:competing`,
        });
      }

      revalidatePath("/dashboard/client");
      revalidatePath("/dashboard/client/proposals");
      revalidatePath("/dashboard/freelancer");
      revalidatePath("/dashboard/freelancer/proposals");
      revalidatePath("/contracts");
      revalidatePath(`/contracts/${txResult.contract.id}`);
      revalidatePath("/messages");
      revalidatePath("/jobs");
      revalidatePath(`/jobs/${proposal.job.id}`);
      revalidatePath(`/dashboard/client/jobs/${proposal.job.id}/proposals`);

      return {
        success: true,
        proposalId: txResult.proposal.id,
        contractId: txResult.contract.id,
        conversationId: txResult.conversation.id,
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
        idempotencyKey: `proposal:${proposal.id}:declined`,
      });

      revalidatePath(`/jobs/${updated.jobId}`);
      revalidatePath(`/dashboard/client/jobs/${updated.jobId}/proposals`);
      revalidatePath("/dashboard/client");
      revalidatePath("/dashboard/client/proposals");
      revalidatePath("/dashboard/freelancer");
      revalidatePath("/dashboard/freelancer/proposals");

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

    // 3. Handle recognized duplicate-key errors for Contract.jobId or Contract.proposalId
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const meta = error.meta as
        | { target?: string | string[]; modelName?: string }
        | undefined;
      const targetStr = Array.isArray(meta?.target)
        ? meta.target.join(" ")
        : typeof meta?.target === "string"
        ? meta.target
        : "";
      const modelName = meta?.modelName || "";

      const isContractJobConflict =
        targetStr.includes("jobId") ||
        (modelName === "Contract" && (targetStr.includes("jobId") || !targetStr)) ||
        /jobId/i.test(targetStr) ||
        /contracts?.*jobId|jobId.*contracts?/i.test(errorMsg) ||
        /Unique constraint failed.*(?:jobId|contracts_jobId)/i.test(errorMsg);

      const isContractProposalConflict =
        targetStr.includes("proposalId") ||
        (modelName === "Contract" && targetStr.includes("proposalId")) ||
        /proposalId/i.test(targetStr) ||
        /contracts?.*proposalId/i.test(errorMsg);

      if (isContractJobConflict || isContractProposalConflict) {
        return {
          success: false,
          error: "A contract has already been awarded and formed for this job.",
        };
      }

      // Unrelated duplicate errors on other models are not misclassified as contract errors
      console.error(
        "[WorkPulse Status Update Unrelated Duplicate Error]:",
        error.message
      );
      return {
        success: false,
        error: "A conflict occurred with an existing record. Please try again.",
      };
    }

    // 4. Handle raw MongoDB E11000 duplicate key errors if propagated
    const isMongoDuplicateKey =
      /E11000\s+duplicate\s+key/i.test(errorMsg) ||
      (typeof (error as Record<string, unknown>)?.code === "number" &&
        (error as Record<string, unknown>)?.code === 11000);

    if (isMongoDuplicateKey) {
      if (
        /contracts?.*jobId|jobId.*contracts?/i.test(errorMsg) ||
        /jobId/i.test(errorMsg)
      ) {
        return {
          success: false,
          error: "A contract has already been awarded and formed for this job.",
        };
      }
      return {
        success: false,
        error: "A conflict occurred with an existing record. Please try again.",
      };
    }

    // 5. Fallback for ordinary unrelated database errors (do not leak raw internals or misclassify as concurrency conflict)
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
    clientId?: string | null;
    clientName?: string | null;
    clientCountry?: string | null;
    client?: {
      id: string;
      name?: string | null;
      companyName?: string | null;
      image?: string | null;
      location?: string | null;
    } | null;
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
      prisma.proposal.count({
        where: {
          freelancerId: user.id,
          status: { in: ["PENDING", "UNDER_REVIEW"] },
        },
      }),
      prisma.proposal.count({ where: { freelancerId: user.id, status: "ACCEPTED" } }),
      prisma.proposal.count({
        where: {
          freelancerId: user.id,
          status: { in: ["REJECTED", "WITHDRAWN"] },
        },
      }),
    ]);

    // 2. Build filtered where clause
    const where: Prisma.ProposalWhereInput = {
      freelancerId: user.id,
    };

    const normalizedStatus = params.status?.toUpperCase();
    if (normalizedStatus && normalizedStatus !== "ALL") {
      if (normalizedStatus === "PENDING" || normalizedStatus === "UNDER_REVIEW") {
        where.status = { in: ["PENDING", "UNDER_REVIEW"] };
      } else if (normalizedStatus === "ACCEPTED") {
        where.status = "ACCEPTED";
      } else if (normalizedStatus === "REJECTED" || normalizedStatus === "DECLINED") {
        where.status = { in: ["REJECTED", "WITHDRAWN"] };
      }
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
              clientId: true,
              clientName: true,
              clientCountry: true,
              client: {
                select: {
                  id: true,
                  name: true,
                  companyName: true,
                  image: true,
                  location: true,
                },
              },
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
              clientId: p.job.clientId,
              clientName: p.job.clientName,
              clientCountry: p.job.clientCountry,
              client: p.job.client,
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
              clientId: null,
              clientName: null,
              clientCountry: null,
              client: null,
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

/**
 * Server Action: Client initiates rate negotiation on a received proposal.
 * Creates/updates a linked HiringOffer of type PROPOSAL_NEGOTIATION and posts a notification.
 */
export async function negotiateProposalRateAction(
  proposalId: string,
  proposedRate: number,
  message?: string
): Promise<{ success: boolean; offerId?: string; error?: string }> {
  const authRes = await verifyUserForAction(
    "CLIENT",
    "Unauthorized: Only clients can negotiate proposal rates."
  );
  if (!authRes.success) {
    return { success: false, error: authRes.error };
  }
  const clientUser = authRes.user;

  if (!proposalId || !OBJECT_ID_REGEX.test(proposalId)) {
    return { success: false, error: "Invalid proposal ID." };
  }

  if (!proposedRate || proposedRate <= 0) {
    return { success: false, error: "Proposed rate must be greater than zero." };
  }

  try {
    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      include: {
        job: true,
        freelancer: { select: { id: true, name: true } },
      },
    });

    if (!proposal) {
      return { success: false, error: "Proposal not found." };
    }

    if (!proposal.job || proposal.job.clientId !== clientUser.id) {
      return { success: false, error: "Forbidden: You do not own the job for this proposal." };
    }

    if (!["PENDING", "UNDER_REVIEW", "SHORTLISTED"].includes(proposal.status)) {
      return { success: false, error: "Cannot negotiate a proposal that has already concluded." };
    }

    // Upsert or create HiringOffer linked to this proposal
    let offer = await prisma.hiringOffer.findFirst({
      where: { proposalId: proposal.id, status: { in: ["PENDING", "COUNTERED"] } },
    });

    const isHourly = proposal.job.type === "HOURLY";
    const roundItem = {
      id: `round_${Date.now()}`,
      senderId: clientUser.id,
      senderRole: Role.CLIENT,
      amount: proposedRate,
      type: proposal.job.type,
      message: message || "Rate negotiation initiated by client.",
      createdAt: new Date(),
    };

    if (offer) {
      offer = await prisma.hiringOffer.update({
        where: { id: offer.id },
        data: {
          amount: proposedRate,
          status: "PENDING",
          lastActionBy: clientUser.id,
          message: message || offer.message,
          negotiationHistory: {
            push: roundItem,
          },
        },
      });
    } else {
      offer = await prisma.hiringOffer.create({
        data: {
          clientId: clientUser.id,
          freelancerId: proposal.freelancerId,
          jobId: proposal.jobId,
          proposalId: proposal.id,
          title: `Proposal Offer: ${proposal.job.title}`,
          description: `Negotiated offer on applicant proposal. Original bid: $${proposal.bidAmount}. Proposed: $${proposedRate}.`,
          type: proposal.job.type,
          amount: proposedRate,
          duration: proposal.estimatedDuration || "Standard milestone timeline",
          status: "PENDING",
          offerType: "PROPOSAL_NEGOTIATION",
          lastActionBy: clientUser.id,
          message: message || null,
          negotiationHistory: [roundItem],
        },
      });
    }

    // Send context message in chat
    const { getOrCreateDirectConversationAction } = await import("@/lib/actions/message");
    const convRes = await getOrCreateDirectConversationAction(proposal.freelancerId, proposal.jobId);
    if (convRes.success && convRes.conversationId) {
      const rateLabel = isHourly ? `$${proposedRate}/hr` : `$${proposedRate.toLocaleString()} Fixed`;
      await prisma.message.create({
        data: {
          conversationId: convRes.conversationId,
          senderId: clientUser.id,
          content: `💬 **Rate Negotiation**: Client proposed ${rateLabel} for "${proposal.job.title}".\n${
            message ? `> ${message}\n` : ""
          }You can accept this offer, decline, or counter-offer.`,
          read: false,
        },
      });
      await prisma.conversation.update({
        where: { id: convRes.conversationId },
        data: { lastMessageAt: new Date() },
      });
    }

    // Notify freelancer
    await createNotificationSafe({
      userId: proposal.freelancerId,
      type: NotificationType.HIRING_OFFER,
      title: "Rate Negotiation Received 💬",
      message: `${clientUser.name || "Client"} proposed a revised rate of $${proposedRate} on your proposal for "${proposal.job.title}".`,
      link: `/dashboard/freelancer/proposals`,
    });

    revalidatePath(`/dashboard/client/jobs/${proposal.jobId}/proposals`);
    revalidatePath("/dashboard/freelancer/proposals");
    revalidatePath("/messages");

    return {
      success: true,
      offerId: offer.id,
    };
  } catch (error) {
    console.error("[WorkPulse Negotiate Proposal Error]:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to submit rate negotiation.",
    };
  }
}

/**
 * Server Action: Freelancer withdraws an active proposal.
 */
export async function withdrawProposalAction(
  proposalId: string
): Promise<{ success: boolean; error?: string }> {
  const authRes = await verifyUserForAction(
    "FREELANCER",
    "Unauthorized: Only freelancers can withdraw proposals."
  );
  if (!authRes.success) {
    return { success: false, error: authRes.error };
  }
  const freelancerUser = authRes.user;

  if (!proposalId || !OBJECT_ID_REGEX.test(proposalId)) {
    return { success: false, error: "Invalid proposal ID." };
  }

  try {
    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      include: { job: true },
    });

    if (!proposal) {
      return { success: false, error: "Proposal not found." };
    }

    if (proposal.freelancerId !== freelancerUser.id) {
      return { success: false, error: "Forbidden: You do not own this proposal." };
    }

    if (proposal.status === "ACCEPTED" || proposal.status === "WITHDRAWN") {
      return { success: false, error: `Cannot withdraw proposal in ${proposal.status.toLowerCase()} status.` };
    }

    await prisma.$transaction(async (tx) => {
      await tx.proposal.update({
        where: { id: proposalId },
        data: { status: "WITHDRAWN" },
      });

      // Decrement job proposalsCount
      if (proposal.jobId) {
        await tx.job.update({
          where: { id: proposal.jobId },
          data: { proposalsCount: { decrement: 1 } },
        });
      }
    });

    revalidatePath("/dashboard/freelancer/proposals");
    if (proposal.jobId) {
      revalidatePath(`/dashboard/client/jobs/${proposal.jobId}/proposals`);
    }

    return { success: true };
  } catch (error) {
    console.error("[WorkPulse Withdraw Proposal Error]:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to withdraw proposal.",
    };
  }
}
