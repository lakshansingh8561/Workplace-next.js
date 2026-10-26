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
 * 3. Cannot submit to own job.
 * 4. Job exists and is currently OPEN.
 * 5. Bid complies with job payment type (FIXED min $5, HOURLY min $3/hr).
 * 6. Enforces single proposal per freelancer per job.
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

    // 5. Create proposal and increment job proposal count
    const proposal = await prisma.proposal.create({
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

    await prisma.job.update({
      where: { id: job.id },
      data: {
        proposalsCount: {
          increment: 1,
        },
      },
    });

    // Revalidate affected views
    revalidatePath("/jobs");
    revalidatePath(`/jobs/${job.id}`);
    revalidatePath(`/dashboard/client/jobs/${job.id}/proposals`);

    return {
      success: true,
      proposalId: proposal.id,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        success: false,
        error: "You have already submitted a proposal for this job contract.",
      };
    }

    console.error(
      "[WorkPulse Proposal Action Error]:",
      error instanceof Error ? error.message : "Database error"
    );

    return {
      success: false,
      error: "Failed to submit proposal. Please verify your connection and try again.",
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

        // 2. Prevent duplicate contract creation on proposal
        const existingContract = await tx.contract.findUnique({
          where: { proposalId: freshProposal.id },
        });

        if (existingContract) {
          throw new Error("A contract has already been formed for this proposal.");
        }

        // 3. Mark the accepted proposal
        const acceptedProp = await tx.proposal.update({
          where: { id: freshProposal.id },
          data: { status: "ACCEPTED" },
        });

        // 4. Form formal Contract record
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

        // 5. Close job to prevent further proposal submissions
        await tx.job.update({
          where: { id: freshProposal.job.id },
          data: { status: "CLOSED" },
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

      revalidatePath(`/jobs/${updated.jobId}`);
      revalidatePath(`/dashboard/client/jobs/${updated.jobId}/proposals`);

      return {
        success: true,
        proposalId: updated.id,
        status: updated.status,
      };
    }
  } catch (error) {
    console.error(
      "[WorkPulse Status Update Error]:",
      error instanceof Error ? error.message : "Database error"
    );

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update proposal status. Please try again.",
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
