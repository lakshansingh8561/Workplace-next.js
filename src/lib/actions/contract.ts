"use server";

import { prisma } from "@/lib/prisma";
import { verifyUserForAction } from "@/lib/session";
import {
  CreateMilestoneSchema,
  MilestoneActionSchema,
  RequestMilestoneChangesSchema,
  UpdateContractStatusSchema,
  DeleteContractSchema,
} from "@/lib/validations/contract";
import { revalidatePath } from "next/cache";
import {
  Prisma,
  ContractStatus,
  MilestoneStatus,
  NotificationType,
  JobStatus,
  ProposalStatus,
} from "@prisma/client";
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
  const authRes = await verifyUserForAction(
    "CLIENT",
    "Unauthorized: Only client accounts can create contract milestones."
  );
  if (!authRes.success) {
    return {
      success: false,
      error: authRes.error,
    };
  }
  const user = authRes.user;

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

    const milestone = await prisma.$transaction(async (tx) => {
      // Coordinate through shared Contract document write lock
      if (tx.contract?.update) {
        await tx.contract.update({
          where: { id: contract.id },
          data: { updatedAt: new Date() },
          select: { id: true },
        });
      }

      return tx.contractMilestone.create({
        data: {
          contractId: contract.id,
          title,
          description: description || null,
          amount,
          dueDate: dueDate ? new Date(dueDate) : null,
          status: MilestoneStatus.ACTIVE, // Created as active milestone ready for work
        },
      });
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
  const authRes = await verifyUserForAction(
    "FREELANCER",
    "Unauthorized: Only freelancer accounts can submit milestone deliverables."
  );
  if (!authRes.success) {
    return {
      success: false,
      error: authRes.error,
    };
  }
  const user = authRes.user;

  const result = MilestoneActionSchema.safeParse(input);

  if (!result.success) {
    return {
      success: false,
      error: "Invalid milestone action request.",
    };
  }

  const { milestoneId, description, attachments, links } = result.data;

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

    if (milestone.status === MilestoneStatus.SUBMITTED) {
      // Milestone is already submitted. Recover notification if missing from a previous failed dispatch.
      const expectedKey = `milestone:${milestone.id}:submitted:v${milestone.lifecycleVersion}`;
      const existingNotif = await prisma.notification.findFirst({
        where: { idempotencyKey: expectedKey },
        select: { id: true },
      });

      if (!existingNotif) {
        await createNotificationSafe({
          userId: milestone.contract.clientId,
          type: NotificationType.MILESTONE_SUBMITTED,
          title: "Milestone Deliverable Submitted",
          message: `A milestone ("${milestone.title}") was submitted for your review.`,
          link: `/contracts/${milestone.contract.id}`,
          idempotencyKey: expectedKey,
        });
      }

      return {
        success: true,
        milestoneId: milestone.id,
      };
    }

    if (
      milestone.status !== MilestoneStatus.ACTIVE &&
      milestone.status !== MilestoneStatus.REVISION_REQUESTED
    ) {
      return {
        success: false,
        error: `Cannot submit work. Milestone is currently ${milestone.status.toLowerCase()}.`,
      };
    }

    const txResult = await prisma.$transaction(async (tx) => {
      // Shared write lock on parent contract to serialize against concurrent contract operations
      await tx.contract.update({
        where: { id: milestone.contract.id },
        data: { updatedAt: new Date() },
      });

      // Re-read milestone inside transaction immediately before updating
      const freshMilestone = await tx.contractMilestone.findUnique({
        where: { id: milestoneId },
        select: {
          id: true,
          status: true,
          lifecycleVersion: true,
        },
      });

      if (!freshMilestone) {
        throw new Error("MILESTONE_NOT_FOUND");
      }

      if (
        freshMilestone.status !== MilestoneStatus.ACTIVE &&
        freshMilestone.status !== MilestoneStatus.REVISION_REQUESTED
      ) {
        return {
          transitioned: false,
          milestone: freshMilestone,
        };
      }

      const submission = {
        id: crypto.randomUUID(),
        freelancerId: user.id,
        description: description || "Milestone completed deliverable",
        status: "SUBMITTED",
        submittedAt: new Date(),
        attachments: (attachments || []).map((att) => ({
          id: crypto.randomUUID(),
          fileName: att.fileName,
          fileUrl: att.fileUrl,
          fileType: att.fileType,
          fileSize: att.fileSize,
          storageProvider: att.storageProvider || "cloudinary",
          createdAt: new Date(),
        })),
        links: (links || []).map((lnk) => ({
          id: crypto.randomUUID(),
          title: lnk.title || null,
          url: lnk.url,
          createdAt: new Date(),
        })),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updated = await tx.contractMilestone.update({
        where: { id: milestoneId },
        data: {
          status: MilestoneStatus.SUBMITTED,
          lifecycleVersion: { increment: 1 },
          submissions: {
            push: submission,
          },
        },
        select: {
          id: true,
          status: true,
          lifecycleVersion: true,
        },
      });

      return {
        transitioned: true,
        milestone: updated,
      };
    });

    if (!txResult.transitioned) {
      // Another concurrent request completed the transition first
      if (txResult.milestone.status === MilestoneStatus.SUBMITTED) {
        const expectedKey = `milestone:${txResult.milestone.id}:submitted:v${txResult.milestone.lifecycleVersion}`;
        const existingNotif = await prisma.notification.findFirst({
          where: { idempotencyKey: expectedKey },
          select: { id: true },
        });

        if (!existingNotif) {
          await createNotificationSafe({
            userId: milestone.contract.clientId,
            type: NotificationType.MILESTONE_SUBMITTED,
            title: "Milestone Deliverable Submitted",
            message: `A milestone ("${milestone.title}") was submitted for your review.`,
            link: `/contracts/${milestone.contract.id}`,
            idempotencyKey: expectedKey,
          });
        }

        return {
          success: true,
          milestoneId: txResult.milestone.id,
        };
      }

      return {
        success: false,
        error: `Cannot submit work. Milestone is currently ${txResult.milestone.status.toLowerCase()}.`,
      };
    }

    revalidatePath("/contracts");
    revalidatePath(`/contracts/${milestone.contract.id}`);
    revalidatePath("/dashboard/freelancer");
    revalidatePath("/dashboard/client");

    // Safe in-app notification for client
    await createNotificationSafe({
      userId: milestone.contract.clientId,
      type: NotificationType.MILESTONE_SUBMITTED,
      title: "Milestone Deliverable Submitted",
      message: `A milestone ("${milestone.title}") was submitted for your review.`,
      link: `/contracts/${milestone.contract.id}`,
      idempotencyKey: `milestone:${txResult.milestone.id}:submitted:v${txResult.milestone.lifecycleVersion}`,
    });

    return {
      success: true,
      milestoneId: txResult.milestone.id,
    };
  } catch (error) {
    const isWriteConflict =
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") ||
      /write\s*conflict|deadlock|transienttransactionerror/i.test(
        error instanceof Error ? error.message : ""
      );

    if (isWriteConflict) {
      try {
        // Allow the winning concurrent transaction up to 250ms to complete its commit
        for (let attempt = 0; attempt < 5; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          const fresh = await prisma.contractMilestone.findUnique({
            where: { id: milestoneId },
            select: {
              id: true,
              status: true,
              lifecycleVersion: true,
              title: true,
              contract: {
                select: {
                  id: true,
                  clientId: true,
                },
              },
            },
          });

          if (fresh && fresh.status === MilestoneStatus.SUBMITTED) {
            const expectedKey = `milestone:${fresh.id}:submitted:v${fresh.lifecycleVersion}`;
            const existingNotif = await prisma.notification.findFirst({
              where: { idempotencyKey: expectedKey },
              select: { id: true },
            });

            if (!existingNotif) {
              await createNotificationSafe({
                userId: fresh.contract.clientId,
                type: NotificationType.MILESTONE_SUBMITTED,
                title: "Milestone Deliverable Submitted",
                message: `A milestone ("${fresh.title}") was submitted for your review.`,
                link: `/contracts/${fresh.contract.id}`,
                idempotencyKey: expectedKey,
              });
            }

            return {
              success: true,
              milestoneId: fresh.id,
            };
          }
        }
      } catch {
        // Fall through to generic error
      }
    }

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
  const authRes = await verifyUserForAction(
    "CLIENT",
    "Unauthorized: Only client accounts can approve milestone deliverables."
  );
  if (!authRes.success) {
    return {
      success: false,
      error: authRes.error,
    };
  }
  const user = authRes.user;

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

    if (milestone.status === MilestoneStatus.APPROVED) {
      // Milestone is already approved. Recover notification if missing from a previous failed dispatch.
      const expectedKey = `milestone:${milestone.id}:approved:v${milestone.lifecycleVersion}`;
      const existingNotif = await prisma.notification.findFirst({
        where: { idempotencyKey: expectedKey },
        select: { id: true },
      });

      if (!existingNotif) {
        await createNotificationSafe({
          userId: milestone.contract.freelancerId,
          type: NotificationType.MILESTONE_APPROVED,
          title: "Milestone Approved!",
          message: `Your milestone ("${milestone.title}") was approved by the client.`,
          link: `/contracts/${milestone.contract.id}`,
          idempotencyKey: expectedKey,
        });
      }

      return {
        success: true,
        milestoneId: milestone.id,
      };
    }

    if (milestone.status !== MilestoneStatus.SUBMITTED) {
      return {
        success: false,
        error: `Cannot approve milestone. It is currently ${milestone.status.toLowerCase()}, not submitted for review.`,
      };
    }

    const txResult = await prisma.$transaction(async (tx) => {
      // Shared write lock on parent contract to serialize against concurrent contract operations
      await tx.contract.update({
        where: { id: milestone.contract.id },
        data: { updatedAt: new Date() },
      });

      // Re-read milestone inside transaction immediately before updating
      const freshMilestone = await tx.contractMilestone.findUnique({
        where: { id: milestoneId },
        select: {
          id: true,
          status: true,
          lifecycleVersion: true,
          submissions: true,
        },
      });

      if (!freshMilestone) {
        throw new Error("MILESTONE_NOT_FOUND");
      }

      if (freshMilestone.status !== MilestoneStatus.SUBMITTED) {
        return {
          transitioned: false,
          milestone: freshMilestone,
        };
      }

      const existingSubs = freshMilestone.submissions || [];
      const updatedSubs = existingSubs.map((sub, idx) => {
        if (idx === existingSubs.length - 1) {
          return {
            ...sub,
            status: "APPROVED",
            reviewedAt: new Date(),
            reviewerId: user.id,
            updatedAt: new Date(),
          };
        }
        return sub;
      });

      const updated = await tx.contractMilestone.update({
        where: { id: milestoneId },
        data: {
          status: MilestoneStatus.APPROVED,
          lifecycleVersion: { increment: 1 },
          submissions: updatedSubs,
        },
        select: {
          id: true,
          status: true,
          lifecycleVersion: true,
        },
      });

      return {
        transitioned: true,
        milestone: updated,
      };
    });

    if (!txResult.transitioned) {
      // Another concurrent request completed the transition first
      if (txResult.milestone.status === MilestoneStatus.APPROVED) {
        const expectedKey = `milestone:${txResult.milestone.id}:approved:v${txResult.milestone.lifecycleVersion}`;
        const existingNotif = await prisma.notification.findFirst({
          where: { idempotencyKey: expectedKey },
          select: { id: true },
        });

        if (!existingNotif) {
          await createNotificationSafe({
            userId: milestone.contract.freelancerId,
            type: NotificationType.MILESTONE_APPROVED,
            title: "Milestone Approved!",
            message: `Your milestone ("${milestone.title}") was approved by the client.`,
            link: `/contracts/${milestone.contract.id}`,
            idempotencyKey: expectedKey,
          });
        }

        return {
          success: true,
          milestoneId: txResult.milestone.id,
        };
      }

      return {
        success: false,
        error: `Cannot approve milestone. It is currently ${txResult.milestone.status.toLowerCase()}, not submitted for review.`,
      };
    }

    revalidatePath("/contracts");
    revalidatePath(`/contracts/${milestone.contract.id}`);
    revalidatePath("/dashboard/client");
    revalidatePath("/dashboard/freelancer");

    // Safe in-app notification for freelancer
    await createNotificationSafe({
      userId: milestone.contract.freelancerId,
      type: NotificationType.MILESTONE_APPROVED,
      title: "Milestone Approved!",
      message: `Your milestone ("${milestone.title}") was approved by the client.`,
      link: `/contracts/${milestone.contract.id}`,
      idempotencyKey: `milestone:${txResult.milestone.id}:approved:v${txResult.milestone.lifecycleVersion}`,
    });

    return {
      success: true,
      milestoneId: txResult.milestone.id,
    };
  } catch (error) {
    const isWriteConflict =
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") ||
      /write\s*conflict|deadlock|transienttransactionerror/i.test(
        error instanceof Error ? error.message : ""
      );

    if (isWriteConflict) {
      try {
        // Allow the winning concurrent transaction up to 250ms to complete its commit
        for (let attempt = 0; attempt < 5; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          const fresh = await prisma.contractMilestone.findUnique({
            where: { id: milestoneId },
            select: {
              id: true,
              status: true,
              lifecycleVersion: true,
              title: true,
              contract: {
                select: {
                  id: true,
                  freelancerId: true,
                },
              },
            },
          });

          if (fresh && fresh.status === MilestoneStatus.APPROVED) {
            const expectedKey = `milestone:${fresh.id}:approved:v${fresh.lifecycleVersion}`;
            const existingNotif = await prisma.notification.findFirst({
              where: { idempotencyKey: expectedKey },
              select: { id: true },
            });

            if (!existingNotif) {
              await createNotificationSafe({
                userId: fresh.contract.freelancerId,
                type: NotificationType.MILESTONE_APPROVED,
                title: "Milestone Approved!",
                message: `Your milestone ("${fresh.title}") was approved by the client.`,
                link: `/contracts/${fresh.contract.id}`,
                idempotencyKey: expectedKey,
              });
            }

            return {
              success: true,
              milestoneId: fresh.id,
            };
          }
        }
      } catch {
        // Fall through to generic error
      }
    }

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
 * Server Action for client owners to request changes / revisions on a submitted milestone deliverable.
 */
export async function requestMilestoneChangesAction(
  input: unknown
): Promise<MilestoneActionResult> {
  const authRes = await verifyUserForAction(
    "CLIENT",
    "Unauthorized: Only client accounts can request changes on milestones."
  );
  if (!authRes.success) {
    return {
      success: false,
      error: authRes.error,
    };
  }
  const user = authRes.user;

  const result = RequestMilestoneChangesSchema.safeParse(input);
  if (!result.success) {
    return {
      success: false,
      error: result.error.issues[0]?.message || "Invalid change request input.",
    };
  }

  const { milestoneId, feedback } = result.data;

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
      return { success: false, error: "Milestone not found." };
    }

    if (milestone.contract.clientId !== user.id) {
      return { success: false, error: "Unauthorized: You do not own this contract." };
    }

    if (milestone.contract.status !== ContractStatus.ACTIVE) {
      return {
        success: false,
        error: `Cannot request changes. Contract is ${milestone.contract.status.toLowerCase()}.`,
      };
    }

    if (milestone.status !== MilestoneStatus.SUBMITTED) {
      return {
        success: false,
        error: `Cannot request changes. Milestone is currently ${milestone.status.toLowerCase()}, not submitted for review.`,
      };
    }

    const existingSubmissions = milestone.submissions || [];
    const updatedSubmissions = existingSubmissions.map((sub, idx) => {
      if (idx === existingSubmissions.length - 1) {
        return {
          ...sub,
          status: "REVISION_REQUESTED",
          reviewedAt: new Date(),
          reviewerId: user.id,
          revisionFeedback: feedback,
          updatedAt: new Date(),
        };
      }
      return sub;
    });

    const updated = await prisma.contractMilestone.update({
      where: { id: milestoneId },
      data: {
        status: MilestoneStatus.REVISION_REQUESTED,
        lifecycleVersion: { increment: 1 },
        submissions: updatedSubmissions,
      },
      select: {
        id: true,
        status: true,
        lifecycleVersion: true,
      },
    });

    revalidatePath("/contracts");
    revalidatePath(`/contracts/${milestone.contract.id}`);
    revalidatePath("/dashboard/freelancer");
    revalidatePath("/dashboard/client");

    // In-app notification to Freelancer
    await createNotificationSafe({
      userId: milestone.contract.freelancerId,
      type: NotificationType.CONTRACT_STATUS,
      title: "Revision Requested on Milestone",
      message: `The client requested revisions on milestone "${milestone.title}": "${feedback.slice(0, 100)}${feedback.length > 100 ? "..." : ""}"`,
      link: `/contracts/${milestone.contract.id}`,
      idempotencyKey: `milestone:${milestone.id}:revision:v${updated.lifecycleVersion}`,
    });

    return {
      success: true,
      milestoneId: milestone.id,
    };
  } catch (error) {
    console.error("[Request Milestone Changes Error]:", error);
    return {
      success: false,
      error: "Failed to request changes on milestone. Please try again.",
    };
  }
}

/**
 * Server Action for client owners to update contract status (ACTIVE, PAUSED, COMPLETED, TERMINATED).
 */
export async function updateContractStatusAction(
  input: unknown
): Promise<ContractStatusActionResult> {
  const authRes = await verifyUserForAction(
    "CLIENT",
    "Unauthorized: Only client accounts can manage contract status."
  );
  if (!authRes.success) {
    return {
      success: false,
      error: authRes.error,
    };
  }
  const user = authRes.user;

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
        lifecycleVersion: true,
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
      // Contract is already at target status. This is a retry or concurrent call.
      // Recover notification if missing from a previous failed dispatch:
      const expectedKey = `contract:${contract.id}:status:${targetStatus}:v${contract.lifecycleVersion}`;
      const existingNotif = await prisma.notification.findFirst({
        where: { idempotencyKey: expectedKey },
        select: { id: true },
      });

      if (!existingNotif) {
        await createNotificationSafe({
          userId: contract.freelancerId,
          type: NotificationType.CONTRACT_STATUS,
          title: `Contract Status Updated: ${targetStatus}`,
          message: `Contract "${contract.title}" status changed to ${targetStatus.toLowerCase()}.`,
          link: `/contracts/${contract.id}`,
          idempotencyKey: expectedKey,
        });
      }

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

    // Atomic conditional update: Compare-And-Swap (CAS) on observed status AND lifecycleVersion
    let updateRes = await prisma.contract.updateMany({
      where: {
        id: contractId,
        status: contract.status,
        lifecycleVersion: contract.lifecycleVersion,
      },
      data: {
        status: targetStatus as ContractStatus,
        lifecycleVersion: { increment: 1 },
        endDate:
          targetStatus === ContractStatus.COMPLETED ||
          targetStatus === ContractStatus.TERMINATED
            ? new Date()
            : null,
      },
    });

    if (updateRes.count === 0) {
      // Re-read latest contract state to determine why CAS did not match
      const freshContract = await prisma.contract.findUnique({
        where: { id: contractId },
        select: {
          id: true,
          status: true,
          lifecycleVersion: true,
          freelancerId: true,
          title: true,
        },
      });

      // Case A: Contract not found
      if (!freshContract) {
        return {
          success: false,
          error: "Contract not found.",
        };
      }

      // Case B: Contract already has requested target status (idempotent retry or concurrent duplicate)
      if (freshContract.status === targetStatus) {
        const expectedKey = `contract:${freshContract.id}:status:${targetStatus}:v${freshContract.lifecycleVersion}`;
        const existingNotif = await prisma.notification.findFirst({
          where: { idempotencyKey: expectedKey },
          select: { id: true },
        });

        if (!existingNotif) {
          await createNotificationSafe({
            userId: freshContract.freelancerId,
            type: NotificationType.CONTRACT_STATUS,
            title: `Contract Status Updated: ${targetStatus}`,
            message: `Contract "${freshContract.title}" status changed to ${targetStatus.toLowerCase()}.`,
            link: `/contracts/${freshContract.id}`,
            idempotencyKey: expectedKey,
          });
        }

        return {
          success: true,
          contractId: freshContract.id,
          status: freshContract.status,
        };
      }

      // Case C: Contract is in terminal state (COMPLETED or TERMINATED)
      if (
        freshContract.status === ContractStatus.COMPLETED ||
        freshContract.status === ContractStatus.TERMINATED
      ) {
        return {
          success: false,
          error: `Cannot update status. Contract is already ${freshContract.status.toLowerCase()} and cannot be changed.`,
        };
      }

      // Legacy document compatibility check:
      // If contract was read at version 1, and freshContract still has the same status and version 1,
      // the CAS update count was 0 because the legacy document in MongoDB lacks the lifecycleVersion field.
      // We perform an atomic CAS matching status and backfilling lifecycleVersion to 2.
      if (
        contract.lifecycleVersion === 1 &&
        freshContract.status === contract.status &&
        freshContract.lifecycleVersion === 1
      ) {
        updateRes = await prisma.contract.updateMany({
          where: {
            id: contractId,
            status: contract.status,
          },
          data: {
            status: targetStatus as ContractStatus,
            lifecycleVersion: 2,
            endDate:
              targetStatus === ContractStatus.COMPLETED ||
              targetStatus === ContractStatus.TERMINATED
                ? new Date()
                : null,
          },
        });
      }

      // If updateRes.count is still 0 after legacy check, handle concurrency conflict:
      if (updateRes.count === 0) {
        // Case D: Concurrency conflict (status changed or ABA version change)
        if (freshContract.status !== contract.status) {
          return {
            success: false,
            error: `Contract status was concurrently updated to ${freshContract.status.toLowerCase()}. Please refresh and try again.`,
          };
        }

        return {
          success: false,
          error: "Contract state was modified concurrently. Please refresh and try again.",
        };
      }
    }

    // Successfully transitioned the contract state
    const updated = await prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        status: true,
        updatedAt: true,
        lifecycleVersion: true,
      },
    });

    if (!updated) {
      return {
        success: false,
        error: "Contract not found after update.",
      };
    }

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
      idempotencyKey: `contract:${updated.id}:status:${targetStatus}:v${updated.lifecycleVersion}`,
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
  const authRes = await verifyUserForAction(
    "CLIENT",
    "Unauthorized: Only client accounts can manage contracts."
  );
  if (!authRes.success) {
    return {
      success: false,
      error: authRes.error,
    };
  }
  const user = authRes.user;

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
        jobId: true,
        proposalId: true,
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

    // 1. Audit Check: Completed contracts must permanently retain historical records
    if (contract.status === ContractStatus.COMPLETED) {
      return {
        success: false,
        error:
          "Cannot delete contract: Completed contracts must be permanently retained for financial and historical audit compliance.",
      };
    }

    // 2. Audit Check: Preserve Payment records
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

    // 3. Audit Check: Preserve Time Entries / Timesheets
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

    // 4. Audit Check: Preserve public reviews
    const reviewCount = prisma.review?.count
      ? await prisma.review.count({
          where: { contractId },
        })
      : 0;

    if (reviewCount > 0) {
      return {
        success: false,
        error:
          "Cannot delete contract: Reviews exist. Contracts with review history must be permanently retained.",
      };
    }

    // 5. Audit Check: Check for active or paid milestones
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
    // Atomically serialize, verify, clean up related draft entities, restore job/proposal state, and delete contract.
    await prisma.$transaction(async (tx) => {
      // Establish document write lock on the Contract record to serialize competing operations
      if (tx.contract?.update) {
        await tx.contract.update({
          where: { id: contractId },
          data: { updatedAt: new Date() },
          select: { id: true },
        });
      }

      // Transactional re-verification: Ensure no payment was created concurrently
      if (tx.payment?.count) {
        const txPaymentCount = await tx.payment.count({ where: { contractId } });
        if (txPaymentCount > 0) {
          throw new Error(
            "Cannot delete contract: Financial records exist. Contracts with payment history must be permanently retained for financial audit compliance."
          );
        }
      }

      // Transactional re-verification: Ensure no time entry was created concurrently
      if (tx.timeEntry?.count) {
        const txTimeEntryCount = await tx.timeEntry.count({ where: { contractId } });
        if (txTimeEntryCount > 0) {
          throw new Error(
            "Cannot delete contract: Timesheet records exist. Contracts with logged time entries must be permanently retained for audit compliance."
          );
        }
      }

      // Safely restore associated Job to OPEN status so client can re-hire
      if (contract.jobId && tx.job?.update) {
        await tx.job.update({
          where: { id: contract.jobId },
          data: { status: JobStatus.OPEN },
        });
      }

      // Safely restore associated Proposal to PENDING status so freelancer is not stranded
      if (contract.proposalId && tx.proposal?.update) {
        await tx.proposal.update({
          where: { id: contract.proposalId },
          data: { status: ProposalStatus.PENDING },
        });
      }

      // Delete any draft milestones
      if (tx.contractMilestone?.deleteMany) {
        await tx.contractMilestone.deleteMany({
          where: { contractId },
        });
      }

      // Delete associated conversation if exists
      if (tx.conversation?.findUnique) {
        const conversation = await tx.conversation.findUnique({
          where: { contractId },
          select: { id: true },
        });

        if (conversation) {
          if (tx.message?.deleteMany) {
            await tx.message.deleteMany({
              where: { conversationId: conversation.id },
            });
          }
          await tx.conversation.delete({
            where: { id: conversation.id },
          });
        }
      }

      // Clean up any timer reservations
      if (tx.activeTimerReservation?.deleteMany) {
        await tx.activeTimerReservation.deleteMany({
          where: { contractId },
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
    const errorMsg = error instanceof Error ? error.message : "";
    if (
      errorMsg.includes("Financial records exist") ||
      errorMsg.includes("Timesheet records exist") ||
      errorMsg.includes("Active or settled milestones exist") ||
      errorMsg.includes("Reviews exist") ||
      errorMsg.includes("Completed contracts")
    ) {
      return {
        success: false,
        error: errorMsg,
      };
    }

    if ((error as { code?: string })?.code === "P2003") {
      return {
        success: false,
        error:
          "Cannot delete contract: Referential integrity protection active. Dependent financial records exist.",
      };
    }

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

