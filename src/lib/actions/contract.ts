"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  CreateMilestoneSchema,
  MilestoneActionSchema,
  UpdateContractStatusSchema,
  DeleteContractSchema,
} from "@/lib/validations/contract";
import { revalidatePath } from "next/cache";
import { ContractStatus, MilestoneStatus, NotificationType } from "@prisma/client";
import { createNotificationSafe } from "@/lib/actions/notification";

export type MilestoneActionResult = {
  success: boolean;
  milestoneId?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export type ContractStatusActionResult = {
  success: boolean;
  contractId?: string;
  status?: ContractStatus;
  error?: string;
};

/**
 * Server Action for client owners to create a new milestone on a contract.
 * Strictly verifies that:
 * 1. Caller is an authenticated CLIENT.
 * 2. Caller owns the contract (contract.clientId === user.id).
 * 3. Contract is in ACTIVE state.
 * 4. For FIXED contracts, total of milestones cannot exceed the agreed contract total.
 */
export async function createMilestoneAction(
  input: unknown
): Promise<MilestoneActionResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "You must be signed in to manage contract milestones.",
    };
  }

  if (user.role !== "CLIENT") {
    return {
      success: false,
      error: "Unauthorized: Only client accounts can create contract milestones.",
    };
  }

  const result = CreateMilestoneSchema.safeParse(input);

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
      error: "Please correct the errors in the milestone form.",
      fieldErrors,
    };
  }

  const { contractId, title, description, amount, dueDate } = result.data;

  try {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        milestones: {
          select: {
            id: true,
            amount: true,
            status: true,
          },
        },
      },
    });

    if (!contract) {
      return {
        success: false,
        error: "Contract not found.",
      };
    }

    if (contract.clientId !== user.id) {
      return {
        success: false,
        error: "Unauthorized: You do not own this contract.",
      };
    }

    if (contract.status !== ContractStatus.ACTIVE) {
      return {
        success: false,
        error: `Cannot add milestones. Contract is currently ${contract.status.toLowerCase()}.`,
      };
    }

    // Budget check for fixed-price contracts
    if (contract.type === "FIXED" && contract.totalAmount !== null) {
      const existingAllocated = contract.milestones.reduce(
        (sum, m) => sum + m.amount,
        0
      );
      const remainingBudget = Math.max(0, contract.totalAmount - existingAllocated);

      if (amount > remainingBudget + 0.001) {
        return {
          success: false,
          error: `Milestone amount ($${amount.toLocaleString()}) exceeds remaining contract budget ($${remainingBudget.toLocaleString()}). Total milestones cannot exceed agreed contract total ($${contract.totalAmount.toLocaleString()}).`,
          fieldErrors: {
            amount: `Cannot exceed remaining budget of $${remainingBudget.toLocaleString()}`,
          },
        };
      }
    }

    const milestone = await prisma.contractMilestone.create({
      data: {
        contractId: contract.id,
        title,
        description: description || null,
        amount,
        dueDate: dueDate ? new Date(dueDate) : null,
        status: MilestoneStatus.ACTIVE, // Created as active milestone ready for work
      },
    });

    revalidatePath("/contracts");
    revalidatePath(`/contracts/${contract.id}`);
    revalidatePath("/dashboard/client");
    revalidatePath("/dashboard/freelancer");

    return {
      success: true,
      milestoneId: milestone.id,
    };
  } catch (error) {
    console.error(
      "[WorkPulse Create Milestone Error]:",
      error instanceof Error ? error.message : "Database error"
    );

    return {
      success: false,
      error: "Failed to create milestone. Please try again.",
    };
  }
}

/**
 * Server Action for freelancers to submit work for an active milestone.
 * Strictly verifies that:
 * 1. Caller is an authenticated FREELANCER.
 * 2. Caller is the designated freelancer on the contract.
 * 3. Contract is ACTIVE.
 * 4. Milestone is currently ACTIVE (cannot submit PENDING or APPROVED milestones).
 */
export async function submitMilestoneAction(
  input: unknown
): Promise<MilestoneActionResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "You must be signed in to submit milestone work.",
    };
  }

  if (user.role !== "FREELANCER") {
    return {
      success: false,
      error: "Unauthorized: Only freelancer accounts can submit milestone deliverables.",
    };
  }

  const result = MilestoneActionSchema.safeParse(input);

  if (!result.success) {
    return {
      success: false,
      error: "Invalid milestone action request.",
    };
  }

  const { milestoneId } = result.data;

  try {
    const milestone = await prisma.contractMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        contract: {
          select: {
            id: true,
            freelancerId: true,
            clientId: true,
            status: true,
          },
        },
      },
    });

    if (!milestone) {
      return {
        success: false,
        error: "Milestone not found.",
      };
    }

    if (milestone.contract.freelancerId !== user.id) {
      return {
        success: false,
        error: "Unauthorized: You are not the assigned freelancer for this contract.",
      };
    }

    if (milestone.contract.status !== ContractStatus.ACTIVE) {
      return {
        success: false,
        error: `Cannot submit work. Contract is ${milestone.contract.status.toLowerCase()}.`,
      };
    }

    if (milestone.status !== MilestoneStatus.ACTIVE) {
      return {
        success: false,
        error: `Cannot submit work. Milestone is currently ${milestone.status.toLowerCase()}.`,
      };
    }

    const updated = await prisma.contractMilestone.update({
      where: { id: milestoneId },
      data: { status: MilestoneStatus.SUBMITTED },
    });

    revalidatePath("/contracts");
    revalidatePath(`/contracts/${milestone.contract.id}`);
    revalidatePath("/dashboard/freelancer");

    // Safe in-app notification for client
    await createNotificationSafe({
      userId: milestone.contract.clientId,
      type: NotificationType.MILESTONE_SUBMITTED,
      title: "Milestone Deliverable Submitted",
      message: `A milestone ("${milestone.title}") was submitted for your review.`,
      link: `/contracts/${milestone.contract.id}`,
    });

    return {
      success: true,
      milestoneId: updated.id,
    };
  } catch (error) {
    console.error(
      "[WorkPulse Submit Milestone Error]:",
      error instanceof Error ? error.message : "Database error"
    );

    return {
      success: false,
      error: "Failed to submit milestone work. Please try again.",
    };
  }
}

/**
 * Server Action for client owners to approve a submitted milestone.
 * Strictly verifies that:
 * 1. Caller is an authenticated CLIENT.
 * 2. Caller owns the contract (contract.clientId === user.id).
 * 3. Contract is ACTIVE.
 * 4. Milestone is in SUBMITTED state.
 * Notice: This records formal milestone completion in the contract audit trail.
 * It does not imply fake financial disbursement.
 */
export async function approveMilestoneAction(
  input: unknown
): Promise<MilestoneActionResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "You must be signed in to approve milestones.",
    };
  }

  if (user.role !== "CLIENT") {
    return {
      success: false,
      error: "Unauthorized: Only client accounts can approve milestone deliverables.",
    };
  }

  const result = MilestoneActionSchema.safeParse(input);

  if (!result.success) {
    return {
      success: false,
      error: "Invalid milestone action request.",
    };
  }

  const { milestoneId } = result.data;

  try {
    const milestone = await prisma.contractMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        contract: {
          select: {
            id: true,
            clientId: true,
            freelancerId: true,
            status: true,
          },
        },
      },
    });

    if (!milestone) {
      return {
        success: false,
        error: "Milestone not found.",
      };
    }

    if (milestone.contract.clientId !== user.id) {
      return {
        success: false,
        error: "Unauthorized: You do not own the contract associated with this milestone.",
      };
    }

    if (milestone.contract.status !== ContractStatus.ACTIVE) {
      return {
        success: false,
        error: `Cannot approve milestone. Contract is ${milestone.contract.status.toLowerCase()}.`,
      };
    }

    if (milestone.status !== MilestoneStatus.SUBMITTED) {
      return {
        success: false,
        error: `Cannot approve milestone. It is currently ${milestone.status.toLowerCase()}, not submitted for review.`,
      };
    }

    const updated = await prisma.contractMilestone.update({
      where: { id: milestoneId },
      data: { status: MilestoneStatus.APPROVED },
    });

    revalidatePath("/contracts");
    revalidatePath(`/contracts/${milestone.contract.id}`);
    revalidatePath("/dashboard/client");

    // Safe in-app notification for freelancer
    await createNotificationSafe({
      userId: milestone.contract.freelancerId,
      type: NotificationType.MILESTONE_APPROVED,
      title: "Milestone Approved!",
      message: `Your milestone ("${milestone.title}") was approved by the client.`,
      link: `/contracts/${milestone.contract.id}`,
    });

    return {
      success: true,
      milestoneId: updated.id,
    };
  } catch (error) {
    console.error(
      "[WorkPulse Approve Milestone Error]:",
      error instanceof Error ? error.message : "Database error"
    );

    return {
      success: false,
      error: "Failed to approve milestone. Please try again.",
    };
  }
}

/**
 * Server Action for client owners to update contract status (ACTIVE, PAUSED, COMPLETED, TERMINATED).
 */
export async function updateContractStatusAction(
  input: unknown
): Promise<ContractStatusActionResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "You must be signed in to manage contract status.",
    };
  }

  if (user.role !== "CLIENT") {
    return {
      success: false,
      error: "Unauthorized: Only client accounts can manage contract status.",
    };
  }

  const result = UpdateContractStatusSchema.safeParse(input);

  if (!result.success) {
    return {
      success: false,
      error: "Invalid contract status request.",
    };
  }

  const { contractId, status: targetStatus } = result.data;

  try {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        clientId: true,
        freelancerId: true,
        title: true,
        status: true,
      },
    });

    if (!contract) {
      return {
        success: false,
        error: "Contract not found.",
      };
    }

    if (contract.clientId !== user.id) {
      return {
        success: false,
        error: "Unauthorized: You do not own this contract.",
      };
    }

    if (contract.status === targetStatus) {
      return {
        success: true,
        contractId: contract.id,
        status: contract.status,
      };
    }

    // Terminal states: COMPLETED and TERMINATED contracts cannot be reopened
    if (
      contract.status === ContractStatus.COMPLETED ||
      contract.status === ContractStatus.TERMINATED
    ) {
      return {
        success: false,
        error: `Cannot update status. Contract is already ${contract.status.toLowerCase()} and cannot be changed.`,
      };
    }

    const updated = await prisma.contract.update({
      where: { id: contractId },
      data: {
        status: targetStatus as ContractStatus,
        endDate:
          targetStatus === ContractStatus.COMPLETED ||
          targetStatus === ContractStatus.TERMINATED
            ? new Date()
            : null,
      },
      select: {
        id: true,
        status: true,
      },
    });

    revalidatePath("/contracts");
    revalidatePath(`/contracts/${contractId}`);
    revalidatePath("/dashboard/client");
    revalidatePath("/dashboard/freelancer");

    // Safe in-app notification for freelancer
    await createNotificationSafe({
      userId: contract.freelancerId,
      type: NotificationType.CONTRACT_STATUS,
      title: `Contract Status Updated: ${targetStatus}`,
      message: `Contract "${contract.title}" status changed to ${targetStatus.toLowerCase()}.`,
      link: `/contracts/${contract.id}`,
    });

    return {
      success: true,
      contractId: updated.id,
      status: updated.status,
    };
  } catch (error) {
    console.error(
      "[WorkPulse Update Contract Status Error]:",
      error instanceof Error ? error.message : "Database error"
    );

    return {
      success: false,
      error: "Failed to update contract status. Please try again.",
    };
  }
}

export type DeleteContractResult = {
  success: boolean;
  contractId?: string;
  error?: string;
};

/**
 * Server Action for client owners to safely delete a draft/inactive contract.
 * Strictly enforces financial and audit record retention:
 * 1. Caller must be an authenticated CLIENT.
 * 2. Caller must be the client owner of the contract.
 * 3. Prohibits deletion if ANY payment record exists for this contract.
 * 4. Prohibits deletion if ANY logged time-entries exist for this contract.
 * 5. Prohibits deletion if ANY milestones are in-progress, submitted, approved, or paid.
 * 6. Only allows deletion of contracts with zero billable history.
 */
export async function deleteContractAction(
  input: unknown
): Promise<DeleteContractResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "You must be signed in to perform this action.",
    };
  }

  if (user.role !== "CLIENT") {
    return {
      success: false,
      error: "Unauthorized: Only client accounts can manage contracts.",
    };
  }

  const result = DeleteContractSchema.safeParse(input);
  if (!result.success) {
    return {
      success: false,
      error: "Invalid contract deletion request.",
    };
  }

  const { contractId } = result.data;

  try {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        clientId: true,
        status: true,
      },
    });

    if (!contract) {
      return {
        success: false,
        error: "Contract not found.",
      };
    }

    if (contract.clientId !== user.id) {
      return {
        success: false,
        error: "Unauthorized: You do not own this contract.",
      };
    }

    // 1. Audit Check: Preserve Payment records
    const paymentCount = await prisma.payment.count({
      where: { contractId },
    });

    if (paymentCount > 0) {
      return {
        success: false,
        error:
          "Cannot delete contract: Financial records exist. Contracts with payment history must be permanently retained for financial audit compliance.",
      };
    }

    // 2. Audit Check: Preserve Time Entries / Timesheets
    const timeEntryCount = await prisma.timeEntry.count({
      where: { contractId },
    });

    if (timeEntryCount > 0) {
      return {
        success: false,
        error:
          "Cannot delete contract: Timesheet records exist. Contracts with logged time entries must be permanently retained for audit compliance.",
      };
    }

    // 3. Audit Check: Check for active or paid milestones
    const activeMilestone = await prisma.contractMilestone.findFirst({
      where: {
        contractId,
        OR: [
          { isPaid: true },
          {
            status: {
              in: [
                MilestoneStatus.ACTIVE,
                MilestoneStatus.SUBMITTED,
                MilestoneStatus.APPROVED,
              ],
            },
          },
        ],
      },
      select: { id: true },
    });

    if (activeMilestone) {
      return {
        success: false,
        error:
          "Cannot delete contract: Active or settled milestones exist. Please terminate or complete the contract instead.",
      };
    }

    // Safe deletion: Contract has zero financial activity.
    // Atomically clean up related draft entities and contract.
    await prisma.$transaction(async (tx) => {
      // Delete any draft milestones
      await tx.contractMilestone.deleteMany({
        where: { contractId },
      });

      // Delete associated conversation if exists
      const conversation = await tx.conversation.findUnique({
        where: { contractId },
        select: { id: true },
      });

      if (conversation) {
        await tx.message.deleteMany({
          where: { conversationId: conversation.id },
        });
        await tx.conversation.delete({
          where: { id: conversation.id },
        });
      }

      await tx.contract.delete({
        where: { id: contractId },
      });
    });

    revalidatePath("/contracts");
    revalidatePath("/dashboard/client");

    return {
      success: true,
      contractId,
    };
  } catch (error) {
    console.error(
      "[WorkPulse Delete Contract Error]:",
      error instanceof Error ? error.message : "Database error"
    );

    return {
      success: false,
      error: "Failed to delete contract. Please try again.",
    };
  }
}

