"use server";

import { prisma } from "@/lib/prisma";
import { verifyUserForAction } from "@/lib/session";
import { createNotificationSafe } from "@/lib/actions/notification";
import { revalidatePath } from "next/cache";
import { getOrCreateDirectConversationAction } from "@/lib/actions/message";
import { Role, PaymentType, NotificationType } from "@prisma/client";
import {
  CreateHiringOfferSchema,
  RespondToOfferSchema,
  type CreateHiringOfferInput,
  type RespondToOfferInput,
} from "@/lib/validations/hiring-offer";

/**
 * Server Action: Client creates and sends a Direct Hiring Offer to a Freelancer.
 */
export async function createDirectHiringOfferAction(
  input: unknown
): Promise<{ success: boolean; offerId?: string; conversationId?: string; error?: string }> {
  const authRes = await verifyUserForAction(
    "CLIENT",
    "Unauthorized: Only clients can send hiring offers."
  );
  if (!authRes.success) {
    return { success: false, error: authRes.error };
  }
  const clientUser = authRes.user;

  const parsed = CreateHiringOfferSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid offer details provided.",
    };
  }

  const data = parsed.data;

  if (data.freelancerId === clientUser.id) {
    return { success: false, error: "You cannot send a hiring offer to yourself." };
  }

  try {
    // 1. Verify freelancer exists and has active FREELANCER role
    const freelancer = await prisma.user.findUnique({
      where: { id: data.freelancerId },
      select: { id: true, name: true, role: true, isAvailable: true },
    });

    if (!freelancer || freelancer.role !== "FREELANCER") {
      return { success: false, error: "Freelancer profile not found or inactive." };
    }

    // 2. Prevent duplicate active hiring offers for the same client-freelancer pair
    const existingActiveOffer = await prisma.hiringOffer.findFirst({
      where: {
        clientId: clientUser.id,
        freelancerId: data.freelancerId,
        status: { in: ["PENDING", "COUNTERED"] },
      },
    });

    if (existingActiveOffer) {
      return {
        success: false,
        error:
          "An active offer or negotiation is already pending with this freelancer. Please wait for their response or withdraw the existing offer first.",
      };
    }

    // 3. Resolve or create Job container
    let resolvedJobId = data.jobId;
    if (resolvedJobId) {
      const ownedJob = await prisma.job.findFirst({
        where: { id: resolvedJobId, clientId: clientUser.id },
      });
      if (!ownedJob) {
        resolvedJobId = null;
      }
    }

    if (!resolvedJobId) {
      const createdJob = await prisma.job.create({
        data: {
          title: data.title,
          description: data.description,
          category: "Direct Contract",
          type: data.type === "HOURLY" ? PaymentType.HOURLY : PaymentType.FIXED,
          budget: data.type === "FIXED" ? data.amount : null,
          hourlyMin: data.type === "HOURLY" ? data.amount : null,
          hourlyMax: data.type === "HOURLY" ? data.amount : null,
          duration: data.duration || null,
          status: "OPEN",
          clientId: clientUser.id,
        },
      });
      resolvedJobId = createdJob.id;
    }

    // 4. Create the HiringOffer record
    const startDate = data.startDate ? new Date(data.startDate) : new Date();

    const offer = await prisma.hiringOffer.create({
      data: {
        clientId: clientUser.id,
        freelancerId: data.freelancerId,
        jobId: resolvedJobId,
        title: data.title,
        description: data.description,
        type: data.type === "HOURLY" ? PaymentType.HOURLY : PaymentType.FIXED,
        amount: data.amount,
        duration: data.duration || null,
        startDate,
        milestones: data.milestones.map((m) => ({
          title: m.title,
          description: m.description || null,
          amount: m.amount,
          dueDate: m.dueDate || null,
        })),
        negotiationHistory: [
          {
            id: `round_${Date.now()}`,
            senderId: clientUser.id,
            senderRole: Role.CLIENT,
            amount: data.amount,
            type: data.type === "HOURLY" ? PaymentType.HOURLY : PaymentType.FIXED,
            message: data.message || "Initial hiring offer dispatched.",
            createdAt: new Date(),
          },
        ],
        status: "PENDING",
        offerType: "DIRECT_HIRE",
        lastActionBy: clientUser.id,
        message: data.message || null,
      },
    });

    // 5. Ensure communication thread exists and post context message
    const convRes = await getOrCreateDirectConversationAction(data.freelancerId, resolvedJobId);
    let conversationId: string | undefined = undefined;

    if (convRes.success && convRes.conversationId) {
      conversationId = convRes.conversationId;
      const rateLabel =
        data.type === "HOURLY" ? `$${data.amount}/hr` : `$${data.amount.toLocaleString()} Fixed`;
      const offerNote = `📋 **Direct Hiring Offer Sent**: "${data.title}" at ${rateLabel}.\n${
        data.message ? `\n> ${data.message}` : ""
      }\nYou can view, accept, or counter-offer directly through your Offers & Invitations inbox.`;

      await prisma.message.create({
        data: {
          conversationId: convRes.conversationId,
          senderId: clientUser.id,
          content: offerNote,
          read: false,
        },
      });

      await prisma.conversation.update({
        where: { id: convRes.conversationId },
        data: { lastMessageAt: new Date() },
      });
    }

    // 6. Send notification to the freelancer
    await createNotificationSafe({
      userId: data.freelancerId,
      type: NotificationType.HIRING_OFFER,
      title: "New Hiring Offer Received",
      message: `${clientUser.name || "A client"} sent you a direct hiring offer for "${data.title}".`,
      link: `/dashboard/freelancer/invitations`,
    });

    revalidatePath("/dashboard/client");
    revalidatePath("/dashboard/freelancer/invitations");
    revalidatePath("/messages");

    return {
      success: true,
      offerId: offer.id,
      conversationId,
    };
  } catch (error) {
    console.error("[WorkPulse Create Hiring Offer Error]:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create hiring offer.",
    };
  }
}

/**
 * Server Action: Freelancer responds to a Hiring Offer (ACCEPT, DECLINE, COUNTER).
 */
export async function respondToHiringOfferAction(
  input: unknown
): Promise<{ success: boolean; contractId?: string; error?: string }> {
  const authRes = await verifyUserForAction(
    "FREELANCER",
    "Unauthorized: Only freelancers can respond to hiring offers."
  );
  if (!authRes.success) {
    return { success: false, error: authRes.error };
  }
  const freelancerUser = authRes.user;

  const parsed = RespondToOfferSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Invalid response parameters." };
  }

  const { offerId, action, counterAmount, message, declineReason } = parsed.data;

  try {
    const offer = await prisma.hiringOffer.findUnique({
      where: { id: offerId },
      include: {
        client: { select: { id: true, name: true, email: true } },
        job: true,
      },
    });

    if (!offer) {
      return { success: false, error: "Hiring offer not found." };
    }

    if (offer.freelancerId !== freelancerUser.id) {
      return { success: false, error: "Forbidden: You are not the recipient of this offer." };
    }

    if (offer.status !== "PENDING" && offer.status !== "COUNTERED") {
      return {
        success: false,
        error: `Cannot respond to this offer. Status is already ${offer.status.toLowerCase()}.`,
      };
    }

    // Action 1: DECLINE
    if (action === "DECLINE") {
      await prisma.hiringOffer.update({
        where: { id: offerId },
        data: {
          status: "DECLINED",
          declineReason: declineReason || message || "Offer declined by freelancer.",
          lastActionBy: freelancerUser.id,
        },
      });

      await createNotificationSafe({
        userId: offer.clientId,
        type: NotificationType.OFFER_DECLINED,
        title: "Hiring Offer Declined",
        message: `${freelancerUser.name || "The freelancer"} has declined your offer for "${offer.title}".`,
        link: `/dashboard/client`,
      });

      revalidatePath("/dashboard/freelancer/invitations");
      revalidatePath("/dashboard/client");
      return { success: true };
    }

    // Action 2: COUNTER OFFER
    if (action === "COUNTER") {
      if (!counterAmount || counterAmount <= 0) {
        return { success: false, error: "Please specify a valid counter-offer amount." };
      }

      const newRound = {
        id: `round_${Date.now()}`,
        senderId: freelancerUser.id,
        senderRole: Role.FREELANCER,
        amount: counterAmount,
        type: offer.type,
        message: message || "Counter-offer proposed by freelancer.",
        createdAt: new Date(),
      };

      await prisma.hiringOffer.update({
        where: { id: offerId },
        data: {
          amount: counterAmount,
          status: "COUNTERED",
          lastActionBy: freelancerUser.id,
          negotiationHistory: {
            push: newRound,
          },
        },
      });

      // Post update in chat
      const conv = await prisma.conversation.findFirst({
        where: { clientId: offer.clientId, freelancerId: freelancerUser.id },
      });

      if (conv) {
        const rateLabel =
          offer.type === "HOURLY" ? `$${counterAmount}/hr` : `$${counterAmount.toLocaleString()} Fixed`;
        await prisma.message.create({
          data: {
            conversationId: conv.id,
            senderId: freelancerUser.id,
            content: `🔄 **Counter-Offer Proposed**: ${rateLabel}\n${
              message ? `> ${message}\n` : ""
            }The client can accept this rate or negotiate further.`,
            read: false,
          },
        });
        await prisma.conversation.update({
          where: { id: conv.id },
          data: { lastMessageAt: new Date() },
        });
      }

      await createNotificationSafe({
        userId: offer.clientId,
        type: NotificationType.OFFER_COUNTERED,
        title: "Counter-Offer Received",
        message: `${freelancerUser.name || "Freelancer"} proposed a counter-offer for "${offer.title}".`,
        link: `/dashboard/client`,
      });

      revalidatePath("/dashboard/freelancer/invitations");
      revalidatePath("/dashboard/client");
      revalidatePath("/messages");
      return { success: true };
    }

    // Action 3: ACCEPT OFFER -> CREATE CONTRACT AT AGREED RATE
    const createdContract = await prisma.$transaction(async (tx) => {
      // Guard against double acceptance
      const freshOffer = await tx.hiringOffer.findUnique({
        where: { id: offerId },
      });
      if (!freshOffer || (freshOffer.status !== "PENDING" && freshOffer.status !== "COUNTERED")) {
        throw new Error("This offer is no longer valid or has already been accepted.");
      }

      // Ensure Job exists and is closed/committed
      let jobIdToUse = freshOffer.jobId;
      if (!jobIdToUse) {
        const generatedJob = await tx.job.create({
          data: {
            title: freshOffer.title,
            description: freshOffer.description,
            category: "Direct Contract",
            type: freshOffer.type,
            budget: freshOffer.type === "FIXED" ? freshOffer.amount : null,
            hourlyMin: freshOffer.type === "HOURLY" ? freshOffer.amount : null,
            hourlyMax: freshOffer.type === "HOURLY" ? freshOffer.amount : null,
            status: "CLOSED",
            clientId: freshOffer.clientId,
          },
        });
        jobIdToUse = generatedJob.id;
      } else {
        await tx.job.update({
          where: { id: jobIdToUse },
          data: { status: "CLOSED" },
        });
      }

      // Check if a proposal exists or create a formal acceptance proposal to uphold DB schema integrity
      let proposal = await tx.proposal.findFirst({
        where: { jobId: jobIdToUse, freelancerId: freelancerUser.id },
      });

      if (!proposal) {
        proposal = await tx.proposal.create({
          data: {
            jobId: jobIdToUse,
            freelancerId: freelancerUser.id,
            coverLetter: `Direct hire contract offer agreed by both parties. Title: "${freshOffer.title}"`,
            bidAmount: freshOffer.amount,
            estimatedDuration: freshOffer.duration || "Agreed milestone timeline",
            status: "ACCEPTED",
          },
        });
      } else {
        await tx.proposal.update({
          where: { id: proposal.id },
          data: { status: "ACCEPTED", bidAmount: freshOffer.amount },
        });
      }

      // Create Active Contract
      const isHourly = freshOffer.type === "HOURLY";
      const contract = await tx.contract.create({
        data: {
          proposalId: proposal.id,
          jobId: jobIdToUse,
          clientId: freshOffer.clientId,
          freelancerId: freelancerUser.id,
          title: freshOffer.title,
          type: freshOffer.type,
          totalAmount: isHourly ? null : freshOffer.amount,
          hourlyRate: isHourly ? freshOffer.amount : null,
          terms: freshOffer.description,
          status: "ACTIVE",
          startDate: freshOffer.startDate || new Date(),
        },
      });

      // If milestones were specified, populate them
      if (freshOffer.milestones && freshOffer.milestones.length > 0) {
        for (const m of freshOffer.milestones) {
          await tx.contractMilestone.create({
            data: {
              contractId: contract.id,
              title: m.title,
              description: m.description,
              amount: m.amount,
              dueDate: m.dueDate ? new Date(m.dueDate) : null,
              status: "PENDING",
            },
          });
        }
      }

      // Mark the offer as ACCEPTED and link contract
      await tx.hiringOffer.update({
        where: { id: offerId },
        data: {
          status: "ACCEPTED",
          contractId: contract.id,
          jobId: jobIdToUse,
          lastActionBy: freelancerUser.id,
        },
      });

      // Link or upgrade conversation
      const conv = await tx.conversation.findFirst({
        where: { clientId: freshOffer.clientId, freelancerId: freelancerUser.id },
      });

      if (conv) {
        await tx.conversation.update({
          where: { id: conv.id },
          data: { contractId: contract.id, type: "CONTRACT", lastMessageAt: new Date() },
        });
      }

      return contract;
    });

    // Notify client of accepted contract
    await createNotificationSafe({
      userId: offer.clientId,
      type: NotificationType.OFFER_ACCEPTED,
      title: "Hiring Offer Accepted! Contract Active 🎉",
      message: `${freelancerUser.name || "Freelancer"} accepted your offer for "${offer.title}". Your contract is now active!`,
      link: `/contracts/${createdContract.id}`,
    });

    revalidatePath("/dashboard/freelancer/invitations");
    revalidatePath("/dashboard/client");
    revalidatePath("/contracts");
    revalidatePath(`/contracts/${createdContract.id}`);

    return {
      success: true,
      contractId: createdContract.id,
    };
  } catch (error) {
    console.error("[WorkPulse Respond Hiring Offer Error]:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to process offer response.",
    };
  }
}

/**
 * Server Action: Client responds to Freelancer's Counter-Offer (ACCEPT, DECLINE, COUNTER).
 */
export async function respondToCounterOfferAction(
  input: unknown
): Promise<{ success: boolean; contractId?: string; error?: string }> {
  const authRes = await verifyUserForAction(
    "CLIENT",
    "Unauthorized: Only clients can respond to counter-offers."
  );
  if (!authRes.success) {
    return { success: false, error: authRes.error };
  }
  const clientUser = authRes.user;

  const parsed = RespondToOfferSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Invalid response parameters." };
  }

  const { offerId, action, counterAmount, message, declineReason } = parsed.data;

  try {
    const offer = await prisma.hiringOffer.findUnique({
      where: { id: offerId },
      include: {
        freelancer: { select: { id: true, name: true, email: true } },
      },
    });

    if (!offer) {
      return { success: false, error: "Offer record not found." };
    }

    if (offer.clientId !== clientUser.id) {
      return { success: false, error: "Forbidden: You do not own this offer." };
    }

    if (offer.status !== "COUNTERED") {
      return { success: false, error: "Offer is not in a counter-offered state." };
    }

    // Decline counter-offer
    if (action === "DECLINE") {
      await prisma.hiringOffer.update({
        where: { id: offerId },
        data: {
          status: "DECLINED",
          declineReason: declineReason || message || "Counter-offer declined by client.",
          lastActionBy: clientUser.id,
        },
      });

      await createNotificationSafe({
        userId: offer.freelancerId,
        type: NotificationType.OFFER_DECLINED,
        title: "Counter-Offer Declined",
        message: `${clientUser.name || "Client"} declined the counter-offer for "${offer.title}".`,
        link: `/dashboard/freelancer/invitations`,
      });

      revalidatePath("/dashboard/client");
      revalidatePath("/dashboard/freelancer/invitations");
      return { success: true };
    }

    // Client counter-proposes another rate
    if (action === "COUNTER") {
      if (!counterAmount || counterAmount <= 0) {
        return { success: false, error: "Please enter a valid counter amount." };
      }

      const newRound = {
        id: `round_${Date.now()}`,
        senderId: clientUser.id,
        senderRole: Role.CLIENT,
        amount: counterAmount,
        type: offer.type,
        message: message || "Counter-rate proposed by client.",
        createdAt: new Date(),
      };

      await prisma.hiringOffer.update({
        where: { id: offerId },
        data: {
          amount: counterAmount,
          status: "PENDING",
          lastActionBy: clientUser.id,
          negotiationHistory: {
            push: newRound,
          },
        },
      });

      await createNotificationSafe({
        userId: offer.freelancerId,
        type: NotificationType.OFFER_COUNTERED,
        title: "Client Responded to Counter-Offer",
        message: `${clientUser.name || "Client"} proposed a new rate for "${offer.title}".`,
        link: `/dashboard/freelancer/invitations`,
      });

      revalidatePath("/dashboard/client");
      revalidatePath("/dashboard/freelancer/invitations");
      return { success: true };
    }

    // Client ACCEPTS the freelancer's counter-offer -> Activates Contract!
    const createdContract = await prisma.$transaction(async (tx) => {
      let jobIdToUse = offer.jobId;
      if (!jobIdToUse) {
        const generatedJob = await tx.job.create({
          data: {
            title: offer.title,
            description: offer.description,
            category: "Direct Contract",
            type: offer.type,
            budget: offer.type === "FIXED" ? offer.amount : null,
            hourlyMin: offer.type === "HOURLY" ? offer.amount : null,
            hourlyMax: offer.type === "HOURLY" ? offer.amount : null,
            status: "CLOSED",
            clientId: clientUser.id,
          },
        });
        jobIdToUse = generatedJob.id;
      } else {
        await tx.job.update({
          where: { id: jobIdToUse },
          data: { status: "CLOSED" },
        });
      }

      let proposal = await tx.proposal.findFirst({
        where: { jobId: jobIdToUse, freelancerId: offer.freelancerId },
      });

      if (!proposal) {
        proposal = await tx.proposal.create({
          data: {
            jobId: jobIdToUse,
            freelancerId: offer.freelancerId,
            coverLetter: `Direct hire contract offer agreed by both parties. Title: "${offer.title}"`,
            bidAmount: offer.amount,
            estimatedDuration: offer.duration || "Agreed milestone timeline",
            status: "ACCEPTED",
          },
        });
      } else {
        await tx.proposal.update({
          where: { id: proposal.id },
          data: { status: "ACCEPTED", bidAmount: offer.amount },
        });
      }

      const isHourly = offer.type === "HOURLY";
      const contract = await tx.contract.create({
        data: {
          proposalId: proposal.id,
          jobId: jobIdToUse,
          clientId: clientUser.id,
          freelancerId: offer.freelancerId,
          title: offer.title,
          type: offer.type,
          totalAmount: isHourly ? null : offer.amount,
          hourlyRate: isHourly ? offer.amount : null,
          terms: offer.description,
          status: "ACTIVE",
          startDate: offer.startDate || new Date(),
        },
      });

      await tx.hiringOffer.update({
        where: { id: offerId },
        data: {
          status: "ACCEPTED",
          contractId: contract.id,
          jobId: jobIdToUse,
          lastActionBy: clientUser.id,
        },
      });

      const conv = await tx.conversation.findFirst({
        where: { clientId: clientUser.id, freelancerId: offer.freelancerId },
      });

      if (conv) {
        await tx.conversation.update({
          where: { id: conv.id },
          data: { contractId: contract.id, type: "CONTRACT", lastMessageAt: new Date() },
        });
      }

      return contract;
    });

    await createNotificationSafe({
      userId: offer.freelancerId,
      type: NotificationType.OFFER_ACCEPTED,
      title: "Contract Active! Counter-Offer Accepted 🎉",
      message: `${clientUser.name || "Client"} accepted your counter-offer for "${offer.title}". Your contract is now active!`,
      link: `/contracts/${createdContract.id}`,
    });

    revalidatePath("/dashboard/client");
    revalidatePath("/dashboard/freelancer/invitations");
    revalidatePath("/contracts");

    return {
      success: true,
      contractId: createdContract.id,
    };
  } catch (error) {
    console.error("[WorkPulse Client Accept Counter Error]:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to process counter-offer acceptance.",
    };
  }
}

/**
 * Server Action: Fetches active and past hiring offers for current user.
 */
export async function getHiringOffersForUserAction(
  filterStatus?: string
): Promise<{ success: boolean; offers: any[]; error?: string }> {
  const authRes = await verifyUserForAction(
    ["CLIENT", "FREELANCER"],
    "Unauthorized: You must be signed in to view offers."
  );
  if (!authRes.success) {
    return { success: false, offers: [], error: authRes.error };
  }
  const user = authRes.user;

  try {
    const where: any = {};
    if (user.role === "CLIENT") {
      where.clientId = user.id;
    } else {
      where.freelancerId = user.id;
    }

    if (filterStatus && filterStatus !== "ALL") {
      where.status = filterStatus;
    }

    const offers = await prisma.hiringOffer.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            image: true,
            companyName: true,
          },
        },
        freelancer: {
          select: {
            id: true,
            name: true,
            image: true,
            title: true,
          },
        },
        job: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    });

    return {
      success: true,
      offers: offers.map((o) => ({
        id: o.id,
        clientId: o.clientId,
        freelancerId: o.freelancerId,
        jobId: o.jobId,
        proposalId: o.proposalId,
        contractId: o.contractId,
        title: o.title,
        description: o.description,
        type: o.type,
        amount: o.amount,
        duration: o.duration,
        startDate: o.startDate ? o.startDate.toISOString() : null,
        milestones: o.milestones,
        negotiationHistory: o.negotiationHistory,
        status: o.status,
        offerType: o.offerType,
        lastActionBy: o.lastActionBy,
        message: o.message,
        declineReason: o.declineReason,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
        client: o.client,
        freelancer: o.freelancer,
        job: o.job,
      })),
    };
  } catch (error) {
    console.error("[WorkPulse Get Hiring Offers Error]:", error);
    return {
      success: false,
      offers: [],
      error: "Failed to load hiring offers.",
    };
  }
}

