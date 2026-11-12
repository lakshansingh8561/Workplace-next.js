"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser, verifyUserForAction } from "@/lib/session";
import {
  SendInterviewInvitationSchema,
  RespondInterviewInvitationSchema,
  WithdrawInterviewInvitationSchema,
} from "@/lib/validations/invitation";
import { createNotificationSafe } from "@/lib/actions/notification";
import { NotificationType, Prisma, InvitationStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { checkRateLimit } from "@/lib/rate-limit";

export type SendInvitationResult = {
  success: boolean;
  invitationId?: string;
  conversationId?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export type RespondInvitationResult = {
  success: boolean;
  status?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export type WithdrawInvitationResult = {
  success: boolean;
  status?: string;
  error?: string;
};

export type InvitationDto = {
  id: string;
  jobId: string;
  clientId: string;
  freelancerId: string;
  conversationId: string;
  message: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "WITHDRAWN" | "EXPIRED";
  expiresAt: string;
  respondedAt: string | null;
  createdAt: string;
  job: {
    id: string;
    title: string;
    type: string;
    budget: number | null;
    hourlyMin: number | null;
    hourlyMax: number | null;
    status: string;
  };
  counterparty: {
    id: string;
    name: string | null;
    image: string | null;
    role: "CLIENT" | "FREELANCER";
  };
};

/**
 * Sends an interview invitation from an authenticated client to a freelancer for an OPEN job.
 * Enforces:
 * 1. Authenticated & email-verified CLIENT.
 * 2. Client owns the job and job status is OPEN.
 * 3. Freelancer exists with active FREELANCER role.
 * 4. Disallows self-invitations.
 * 5. Rate limit: 10 invitations per hour per client.
 * 6. Disallows duplicate invitations (one per jobId/freelancerId).
 * 7. Atomically creates or reuses pre-hire conversation, creates invitation record, and dispatches initial message.
 * 8. Delivers in-app notification to the invited freelancer.
 */
export async function sendInterviewInvitationAction(
  input: unknown
): Promise<SendInvitationResult> {
  const authRes = await verifyUserForAction(
    "CLIENT",
    "Unauthorized: Only client accounts can send interview invitations."
  );
  if (!authRes.success) {
    return {
      success: false,
      error: authRes.error,
    };
  }
  const user = authRes.user;

  // Rate limit: max 10 invitations per hour per client
  const rateLimit = await checkRateLimit(`invitation:${user.id}`, {
    limit: 10,
    windowMs: 3600_000,
  });
  if (!rateLimit.success) {
    return {
      success: false,
      error: "You have sent too many interview invitations. Please wait before sending more.",
    };
  }

  const result = SendInterviewInvitationSchema.safeParse(input);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    result.error.issues.forEach((issue) => {
      const field = issue.path[0];
      if (field) {
        fieldErrors[String(field)] = issue.message;
      }
    });

    return {
      success: false,
      error: result.error.issues[0]?.message || "Invalid invitation input.",
      fieldErrors,
    };
  }

  const { jobId, freelancerId, message } = result.data;

  // Prevent self-invitation
  if (freelancerId === user.id) {
    return {
      success: false,
      error: "You cannot send an interview invitation to yourself.",
    };
  }

  try {
    // 1. Verify job exists, is owned by caller, and is OPEN
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, title: true, clientId: true, status: true },
    });

    if (!job) {
      return {
        success: false,
        error: "Referenced job posting not found.",
      };
    }

    if (job.clientId !== user.id) {
      return {
        success: false,
        error: "Forbidden: You do not own this job posting.",
      };
    }

    if (job.status !== "OPEN") {
      return {
        success: false,
        error: `Cannot send interview invitation. Job is currently ${job.status.toLowerCase()}.`,
      };
    }

    // 2. Verify freelancer exists and has FREELANCER role
    const freelancer = await prisma.user.findUnique({
      where: { id: freelancerId },
      select: { id: true, name: true, role: true, roleSelected: true },
    });

    if (!freelancer || freelancer.role !== "FREELANCER" || freelancer.roleSelected === false) {
      return {
        success: false,
        error: "The selected freelancer profile is not active or available for invitations.",
      };
    }

    // 3. Check for existing invitation: prevent duplicate active invitations
    const existingInvitation = await prisma.interviewInvitation.findUnique({
      where: {
        jobId_freelancerId: {
          jobId,
          freelancerId,
        },
      },
      select: { id: true, status: true, conversationId: true },
    });

    if (existingInvitation) {
      if (existingInvitation.status === "PENDING") {
        return {
          success: false,
          error: "An interview invitation has already been sent to this freelancer for this job.",
        };
      }
      if (existingInvitation.status === "ACCEPTED") {
        return {
          success: false,
          error: "This freelancer has already accepted an interview invitation for this job.",
        };
      }
    }

    // 4. Atomic multi-document transaction: Conversation + InterviewInvitation + Initial Message
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7-day expiration

    const txResult = await prisma.$transaction(async (tx) => {
      // Re-verify in transaction to guard against concurrent invitation races
      const concurrentInv = await tx.interviewInvitation.findUnique({
        where: {
          jobId_freelancerId: {
            jobId,
            freelancerId,
          },
        },
        select: { id: true, status: true },
      });

      if (concurrentInv && (concurrentInv.status === "PENDING" || concurrentInv.status === "ACCEPTED")) {
        throw new Error("An interview invitation has already been sent to this freelancer for this job.");
      }

      // Check or create pre-hire conversation
      let conversation = await tx.conversation.findUnique({
        where: {
          jobId_freelancerId: {
            jobId,
            freelancerId,
          },
        },
        select: { id: true },
      });

      if (!conversation) {
        conversation = await tx.conversation.create({
          data: {
            type: "PRE_HIRE",
            jobId,
            clientId: user.id,
            freelancerId,
            lastMessageAt: new Date(),
          },
          select: { id: true },
        });
      }

      // Create or renew interview invitation record
      let invitationId: string;
      if (concurrentInv) {
        const renewed = await tx.interviewInvitation.update({
          where: { id: concurrentInv.id },
          data: {
            message,
            status: "PENDING",
            expiresAt,
            respondedAt: null,
          },
          select: { id: true },
        });
        invitationId = renewed.id;
      } else {
        const created = await tx.interviewInvitation.create({
          data: {
            jobId,
            clientId: user.id,
            freelancerId,
            conversationId: conversation.id,
            message,
            status: "PENDING",
            expiresAt,
          },
          select: { id: true },
        });
        invitationId = created.id;
      }

      // Dispatch introductory message into the conversation thread
      await tx.message.create({
        data: {
          conversationId: conversation.id,
          senderId: user.id,
          content: message,
        },
      });

      // Touch conversation lastMessageAt
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      });

      return {
        invitationId,
        conversationId: conversation.id,
      };
    });

    // 5. In-app notification for the invited freelancer
    const clientName = user.name || "Client";
    await createNotificationSafe({
      userId: freelancerId,
      type: NotificationType.INTERVIEW_INVITATION,
      title: "Interview Invitation Received! 🎯",
      message: `${clientName} invited you to interview for "${job.title}".`,
      link: `/messages?conversationId=${txResult.conversationId}`,
      idempotencyKey: `invitation:${txResult.invitationId}:sent`,
    });

    revalidatePath("/messages");
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath(`/freelancers/${freelancerId}`);

    return {
      success: true,
      invitationId: txResult.invitationId,
      conversationId: txResult.conversationId,
    };
  } catch (error) {
    if (
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002") ||
      (error as { code?: string })?.code === "P2002"
    ) {
      return {
        success: false,
        error: "An interview invitation has already been sent to this freelancer for this job.",
      };
    }

    console.error(
      "[WorkPulse Send Invitation Error]:",
      error instanceof Error ? error.message : "Database error"
    );

    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to dispatch interview invitation.",
    };
  }
}

/**
 * Responds to an interview invitation (ACCEPT or DECLINE).
 * Strictly enforces:
 * 1. Authenticated & email-verified FREELANCER.
 * 2. Caller is the designated recipient of the invitation.
 * 3. Invitation is currently in PENDING state.
 * 4. Invitation has not expired.
 * 5. Disallows further messages from freelancer if declined.
 * 6. Emits in-app notification to the client.
 */
export async function respondToInvitationAction(
  input: unknown
): Promise<RespondInvitationResult> {
  const authRes = await verifyUserForAction(
    "FREELANCER",
    "Unauthorized: Only freelancer accounts can respond to interview invitations."
  );
  if (!authRes.success) {
    return {
      success: false,
      error: authRes.error,
    };
  }
  const user = authRes.user;

  const result = RespondInterviewInvitationSchema.safeParse(input);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    result.error.issues.forEach((issue) => {
      const field = issue.path[0];
      if (field) {
        fieldErrors[String(field)] = issue.message;
      }
    });

    return {
      success: false,
      error: result.error.issues[0]?.message || "Invalid invitation response input.",
      fieldErrors,
    };
  }

  const { invitationId, action, reason } = result.data;

  try {
    const invitation = await prisma.interviewInvitation.findUnique({
      where: { id: invitationId },
      include: {
        job: { select: { id: true, title: true } },
        conversation: { select: { id: true } },
      },
    });

    if (!invitation) {
      return {
        success: false,
        error: "Interview invitation not found.",
      };
    }

    // Verify recipient ownership
    if (invitation.freelancerId !== user.id) {
      return {
        success: false,
        error: "Forbidden: You are not authorized to respond to this invitation.",
      };
    }

    if (invitation.status !== "PENDING") {
      return {
        success: false,
        error: `Cannot respond. This invitation is already ${invitation.status.toLowerCase()}.`,
      };
    }

    // Check expiration
    if (invitation.expiresAt < new Date()) {
      await prisma.interviewInvitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED", respondedAt: new Date() },
      });

      return {
        success: false,
        error: "This interview invitation has expired.",
      };
    }

    const newStatus = action === "ACCEPT" ? "ACCEPTED" : "DECLINED";

    await prisma.$transaction(async (tx) => {
      // Conditional atomic state transition: only succeeds if invitation is strictly PENDING
      const updateResult = await tx.interviewInvitation.updateMany({
        where: {
          id: invitation.id,
          status: "PENDING",
        },
        data: {
          status: newStatus,
          respondedAt: new Date(),
        },
      });

      if (updateResult.count === 0) {
        throw new Error(
          `Cannot respond. This invitation is no longer pending.`
        );
      }

      // If declined with a reason, insert informative system record in conversation
      if (newStatus === "DECLINED") {
        const declineMsg = reason
          ? `[Invitation Declined] ${reason}`
          : "[Invitation Declined by Freelancer]";

        await tx.message.create({
          data: {
            conversationId: invitation.conversationId,
            senderId: user.id,
            content: declineMsg,
          },
        });

        await tx.conversation.update({
          where: { id: invitation.conversationId },
          data: { lastMessageAt: new Date() },
        });
      }
    });

    // Notify client
    const freelancerName = user.name || "Freelancer";
    const notificationType =
      newStatus === "ACCEPTED"
        ? NotificationType.INVITATION_ACCEPTED
        : NotificationType.INVITATION_DECLINED;

    const notifTitle =
      newStatus === "ACCEPTED"
        ? "Interview Invitation Accepted! 🤝"
        : "Interview Invitation Declined";

    const notifMessage =
      newStatus === "ACCEPTED"
        ? `${freelancerName} accepted your interview invitation for "${invitation.job.title}".`
        : `${freelancerName} declined the invitation for "${invitation.job.title}".`;

    await createNotificationSafe({
      userId: invitation.clientId,
      type: notificationType,
      title: notifTitle,
      message: notifMessage,
      link: `/messages?conversationId=${invitation.conversationId}`,
      idempotencyKey: `invitation:${invitation.id}:${newStatus.toLowerCase()}`,
    });

    revalidatePath("/messages");

    return {
      success: true,
      status: newStatus,
    };
  } catch (error) {
    console.error(
      "[WorkPulse Respond Invitation Error]:",
      error instanceof Error ? error.message : "Database error"
    );
    return {
      success: false,
      error: "Failed to submit invitation response.",
    };
  }
}

/**
 * Withdraws a pending interview invitation.
 * Strictly enforces:
 * 1. Authenticated & email-verified CLIENT.
 * 2. Caller owns the invitation.
 * 3. Invitation is currently in PENDING state.
 * 4. Notifies the freelancer.
 */
export async function withdrawInterviewInvitationAction(
  input: unknown
): Promise<WithdrawInvitationResult> {
  const authRes = await verifyUserForAction(
    "CLIENT",
    "Unauthorized: Only client accounts can withdraw interview invitations."
  );
  if (!authRes.success) {
    return {
      success: false,
      error: authRes.error,
    };
  }
  const user = authRes.user;

  const result = WithdrawInterviewInvitationSchema.safeParse(input);
  if (!result.success) {
    return {
      success: false,
      error: result.error.issues[0]?.message || "Invalid withdrawal request.",
    };
  }

  const { invitationId } = result.data;

  try {
    const invitation = await prisma.interviewInvitation.findUnique({
      where: { id: invitationId },
      include: {
        job: { select: { id: true, title: true } },
      },
    });

    if (!invitation) {
      return {
        success: false,
        error: "Interview invitation not found.",
      };
    }

    if (invitation.clientId !== user.id) {
      return {
        success: false,
        error: "Forbidden: You do not own this invitation.",
      };
    }

    if (invitation.status !== "PENDING") {
      return {
        success: false,
        error: `Cannot withdraw invitation. It is already marked as ${invitation.status.toLowerCase()}.`,
      };
    }

    await prisma.$transaction(async (tx) => {
      // Conditional atomic state transition: only succeeds if invitation is strictly PENDING
      const updateResult = await tx.interviewInvitation.updateMany({
        where: {
          id: invitation.id,
          status: "PENDING",
        },
        data: {
          status: "WITHDRAWN",
          respondedAt: new Date(),
        },
      });

      if (updateResult.count === 0) {
        throw new Error(
          `Cannot withdraw invitation. It is no longer pending.`
        );
      }

      await tx.message.create({
        data: {
          conversationId: invitation.conversationId,
          senderId: user.id,
          content: "[Interview Invitation Withdrawn by Client]",
        },
      });

      await tx.conversation.update({
        where: { id: invitation.conversationId },
        data: { lastMessageAt: new Date() },
      });
    });

    // Notify freelancer
    await createNotificationSafe({
      userId: invitation.freelancerId,
      type: NotificationType.INVITATION_DECLINED,
      title: "Interview Invitation Withdrawn",
      message: `The client has withdrawn their invitation for "${invitation.job.title}".`,
      link: `/messages?conversationId=${invitation.conversationId}`,
      idempotencyKey: `invitation:${invitation.id}:withdrawn`,
    });

    revalidatePath("/messages");

    return {
      success: true,
      status: "WITHDRAWN",
    };
  } catch (error) {
    console.error(
      "[WorkPulse Withdraw Invitation Error]:",
      error instanceof Error ? error.message : "Database error"
    );
    return {
      success: false,
      error: "Failed to withdraw interview invitation.",
    };
  }
}

/**
 * Retrieves all invitations for the authenticated user (client or freelancer).
 */
export async function getMyInvitationsAction(
  filter?: { status?: string; limit?: number }
): Promise<{ success: boolean; invitations?: InvitationDto[]; error?: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      success: false,
      error: "Unauthorized: Please sign in.",
      invitations: [],
    };
  }

  try {
    const isClient = user.role === "CLIENT";
    const whereClause: Prisma.InterviewInvitationWhereInput = isClient
      ? { clientId: user.id }
      : { freelancerId: user.id };

    if (filter?.status && filter.status !== "ALL") {
      whereClause.status = filter.status as InvitationStatus;
    }

    const safeLimit = Math.min(Math.max(filter?.limit || 20, 1), 50);

    const rawInvitations = await prisma.interviewInvitation.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: safeLimit,
      include: {
        job: {
          select: {
            id: true,
            title: true,
            type: true,
            budget: true,
            hourlyMin: true,
            hourlyMax: true,
            status: true,
          },
        },
        client: {
          select: {
            id: true,
            name: true,
            image: true,
            role: true,
          },
        },
        freelancer: {
          select: {
            id: true,
            name: true,
            image: true,
            role: true,
          },
        },
      },
    });

    const invitations: InvitationDto[] = rawInvitations.map((inv) => {
      const isPastExpiry = inv.status === "PENDING" && new Date(inv.expiresAt) < new Date();
      const effectiveStatus = isPastExpiry ? "EXPIRED" : inv.status;

      return {
        id: inv.id,
        jobId: inv.jobId,
        clientId: inv.clientId,
        freelancerId: inv.freelancerId,
        conversationId: inv.conversationId,
        message: inv.message,
        status: effectiveStatus,
        expiresAt: inv.expiresAt.toISOString(),
        respondedAt: inv.respondedAt ? inv.respondedAt.toISOString() : null,
        createdAt: inv.createdAt.toISOString(),
        job: inv.job,
        counterparty: isClient
          ? {
              id: inv.freelancer.id,
              name: inv.freelancer.name,
              image: inv.freelancer.image,
              role: "FREELANCER",
            }
          : {
              id: inv.client.id,
              name: inv.client.name,
              image: inv.client.image,
              role: "CLIENT",
            },
      };
    });

    return {
      success: true,
      invitations,
    };
  } catch (error) {
    console.error(
      "[WorkPulse Get Invitations Error]:",
      error instanceof Error ? error.message : "Database error"
    );
    return {
      success: false,
      error: "Failed to retrieve interview invitations.",
      invitations: [],
    };
  }
}
