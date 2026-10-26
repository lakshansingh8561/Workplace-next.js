"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  SendMessageSchema,
  GetMessagesSchema,
  OBJECT_ID_REGEX,
} from "@/lib/validations/message";
import { createNotificationSafe } from "@/lib/actions/notification";
import { NotificationType, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { checkRateLimit } from "@/lib/rate-limit";

export type ChatMessageDto = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  read: boolean;
  createdAt: string;
  sender: {
    id: string;
    name: string | null;
    image?: string | null;
    role?: string | null;
  };
};

export type ConversationSummaryDto = {
  id: string;
  contractId: string;
  clientId: string;
  freelancerId: string;
  lastMessageAt: string;
  unreadCount: number;
  lastMessageSnippet: string | null;
  contract: {
    id: string;
    title: string;
    status: string;
  };
  client: {
    id: string;
    name: string | null;
    image?: string | null;
    role?: string | null;
  };
  freelancer: {
    id: string;
    name: string | null;
    image?: string | null;
    role?: string | null;
  };
  counterparty: {
    id: string;
    name: string | null;
    image?: string | null;
    role: "CLIENT" | "FREELANCER";
  };
};

/**
 * Ensures or creates a conversation associated with a contract.
 * Only the contract's client and freelancer are allowed access.
 */
export async function getOrCreateConversationForContractAction(
  contractId: string
): Promise<{ success: boolean; conversationId?: string; error?: string }> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "You must be signed in to access contract messaging.",
    };
  }

  // Verify caller has completed onboarding with a valid role
  if (!user.roleSelected || (user.role !== "CLIENT" && user.role !== "FREELANCER")) {
    return {
      success: false,
      error: "Please complete onboarding before accessing contract messaging.",
    };
  }

  if (!contractId || !OBJECT_ID_REGEX.test(contractId)) {
    return {
      success: false,
      error: "Invalid Contract ID format.",
    };
  }

  try {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        status: true,
        clientId: true,
        freelancerId: true,
      },
    });

    if (!contract) {
      return {
        success: false,
        error: "Contract not found.",
      };
    }

    // Strictly enforce relationship to the contract and appropriate role alignment
    const isClientParticipant = contract.clientId === user.id && user.role === "CLIENT";
    const isFreelancerParticipant = contract.freelancerId === user.id && user.role === "FREELANCER";

    if (!isClientParticipant && !isFreelancerParticipant) {
      return {
        success: false,
        error: "Forbidden: You are not an authorized participant in this contract.",
      };
    }

    // Check if conversation already exists
    let conversation = await prisma.conversation.findUnique({
      where: { contractId: contract.id },
      select: { id: true },
    });

    if (!conversation) {
      try {
        conversation = await prisma.conversation.create({
          data: {
            contractId: contract.id,
            clientId: contract.clientId,
            freelancerId: contract.freelancerId,
            lastMessageAt: new Date(),
          },
          select: { id: true },
        });
      } catch (createErr) {
        // Concurrency guard: if a concurrent request already created the conversation, resolve it safely
        if (
          createErr instanceof Prisma.PrismaClientKnownRequestError &&
          createErr.code === "P2002"
        ) {
          conversation = await prisma.conversation.findUnique({
            where: { contractId: contract.id },
            select: { id: true },
          });
        } else {
          throw createErr;
        }
      }
    }

    if (!conversation) {
      return {
        success: false,
        error: "Failed to establish conversation thread.",
      };
    }

    return {
      success: true,
      conversationId: conversation.id,
    };
  } catch (error) {
    console.error(
      "[WorkPulse Messaging Error]:",
      error instanceof Error ? error.message : "Database error"
    );
    return {
      success: false,
      error: "Failed to load contract conversation.",
    };
  }
}

/**
 * Fetch all conversations for the authenticated user with unread counts.
 */
export async function getConversationsAction(): Promise<{
  success: boolean;
  conversations?: ConversationSummaryDto[];
  error?: string;
}> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "You must be signed in to access messages.",
      conversations: [],
    };
  }

  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [{ clientId: user.id }, { freelancerId: user.id }],
      },
      orderBy: {
        lastMessageAt: "desc",
      },
      include: {
        contract: {
          select: {
            id: true,
            title: true,
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
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            content: true,
            createdAt: true,
          },
        },
      },
    });

    // Compute unread counts for each conversation
    const conversationSummaries: ConversationSummaryDto[] = await Promise.all(
      conversations.map(async (c) => {
        const unreadCount = await prisma.message.count({
          where: {
            conversationId: c.id,
            senderId: { not: user.id },
            read: false,
          },
        });

        const isClient = user.id === c.clientId;
        const counterparty = isClient
          ? {
              id: c.freelancer.id,
              name: c.freelancer.name,
              image: c.freelancer.image,
              role: "FREELANCER" as const,
            }
          : {
              id: c.client.id,
              name: c.client.name,
              image: c.client.image,
              role: "CLIENT" as const,
            };

        const lastMsg = c.messages[0];

        return {
          id: c.id,
          contractId: c.contractId,
          clientId: c.clientId,
          freelancerId: c.freelancerId,
          lastMessageAt: c.lastMessageAt.toISOString(),
          unreadCount,
          lastMessageSnippet: lastMsg ? lastMsg.content : null,
          contract: {
            id: c.contract.id,
            title: c.contract.title,
            status: c.contract.status,
          },
          client: c.client,
          freelancer: c.freelancer,
          counterparty,
        };
      })
    );

    return {
      success: true,
      conversations: conversationSummaries,
    };
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return {
      success: false,
      error: "Failed to retrieve conversation threads.",
      conversations: [],
    };
  }
}

/**
 * Fetch messages for a specific conversation with strict access check.
 * Automatically marks incoming messages as read for the authenticated viewer.
 */
export async function getMessagesAction(
  conversationId: string,
  limit?: number
): Promise<{
  success: boolean;
  messages?: ChatMessageDto[];
  conversation?: {
    id: string;
    contractId: string;
    contractTitle: string;
    contractStatus: string;
    counterparty: {
      id: string;
      name: string | null;
      image?: string | null;
      role: "CLIENT" | "FREELANCER";
    };
  };
  error?: string;
}> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "Unauthorized: Please sign in.",
    };
  }

  const parsed = GetMessagesSchema.safeParse({ conversationId, limit });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid conversation query.",
    };
  }

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: parsed.data.conversationId },
      include: {
        contract: {
          select: {
            id: true,
            title: true,
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

    if (!conversation) {
      return {
        success: false,
        error: "Conversation not found.",
      };
    }

    // Verify membership: only client or freelancer can view
    if (conversation.clientId !== user.id && conversation.freelancerId !== user.id) {
      return {
        success: false,
        error: "Forbidden: You are not authorized to view this conversation.",
      };
    }

    const safeLimit = Math.min(Math.max(parsed.data.limit || 50, 1), 100);

    // Fetch messages in chronological order
    const rawMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: safeLimit,
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        content: true,
        read: true,
        createdAt: true,
        sender: {
          select: {
            id: true,
            name: true,
            image: true,
            role: true,
          },
        },
      },
    });

    // Mark unread messages sent by the counterparty as read
    await prisma.message.updateMany({
      where: {
        conversationId: conversation.id,
        senderId: { not: user.id },
        read: false,
      },
      data: {
        read: true,
      },
    });

    const isClient = user.id === conversation.clientId;
    const counterparty = isClient
      ? {
          id: conversation.freelancer.id,
          name: conversation.freelancer.name,
          image: conversation.freelancer.image,
          role: "FREELANCER" as const,
        }
      : {
          id: conversation.client.id,
          name: conversation.client.name,
          image: conversation.client.image,
          role: "CLIENT" as const,
        };

    return {
      success: true,
      messages: rawMessages.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        content: m.content,
        read: m.read,
        createdAt: m.createdAt.toISOString(),
        sender: m.sender,
      })),
      conversation: {
        id: conversation.id,
        contractId: conversation.contractId,
        contractTitle: conversation.contract.title,
        contractStatus: conversation.contract.status,
        counterparty,
      },
    };
  } catch (error) {
    console.error("Error retrieving messages:", error);
    return {
      success: false,
      error: "Failed to load messages.",
    };
  }
}

/**
 * Send a message within a contract conversation.
 * Always sets senderId from the authenticated session (prevents spoofing).
 * Validates length, non-empty whitespace-trimmed content.
 * Delivers an in-app notification to the counterparty safely.
 */
export async function sendMessageAction(
  input: unknown
): Promise<{
  success: boolean;
  message?: ChatMessageDto;
  error?: string;
  fieldErrors?: Record<string, string>;
}> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "Unauthorized: You must be signed in to send messages.",
    };
  }

  // Rate limit messages (max 30 messages per 60 seconds per user)
  const rateLimit = await checkRateLimit(`message:${user.id}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.success) {
    return {
      success: false,
      error: "You are sending messages too quickly. Please wait a moment before sending more.",
    };
  }

  const result = SendMessageSchema.safeParse(input);
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
      error: result.error.issues[0]?.message || "Validation error.",
      fieldErrors,
    };
  }

  const { conversationId, content } = result.data;

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        contract: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (!conversation) {
      return {
        success: false,
        error: "Conversation thread does not exist.",
      };
    }

    // Verify caller is a member
    if (conversation.clientId !== user.id && conversation.freelancerId !== user.id) {
      return {
        success: false,
        error: "Forbidden: You are not a member of this conversation.",
      };
    }

    const counterpartyId =
      user.id === conversation.clientId
        ? conversation.freelancerId
        : conversation.clientId;

    // Create the message in DB
    const newMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: user.id,
        content,
      },
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        content: true,
        read: true,
        createdAt: true,
        sender: {
          select: {
            id: true,
            name: true,
            image: true,
            role: true,
          },
        },
      },
    });

    // Update conversation lastMessageAt timestamp
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
      },
    });

    // Safely deliver in-app notification without throwing if fails
    const senderName = user.name || (user.role === "CLIENT" ? "Client" : "Freelancer");
    const preview = content.length > 80 ? content.slice(0, 77) + "..." : content;

    await createNotificationSafe({
      userId: counterpartyId,
      type: NotificationType.NEW_MESSAGE,
      title: `New message from ${senderName}`,
      message: preview,
      link: `/messages?conversationId=${conversation.id}`,
    });

    revalidatePath("/messages");

    return {
      success: true,
      message: {
        id: newMessage.id,
        conversationId: newMessage.conversationId,
        senderId: newMessage.senderId,
        content: newMessage.content,
        read: newMessage.read,
        createdAt: newMessage.createdAt.toISOString(),
        sender: newMessage.sender,
      },
    };
  } catch (error) {
    console.error(
      "[WorkPulse Send Message Error]:",
      error instanceof Error ? error.message : "Database error"
    );
    return {
      success: false,
      error: "Failed to deliver message. Please try again.",
    };
  }
}
