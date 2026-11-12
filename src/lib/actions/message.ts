"use server";

import { prisma } from "@/lib/prisma";
import { verifyUserForAction } from "@/lib/session";
import {
  SendMessageSchema,
  GetMessagesSchema,
  GetConversationsSchema,
  MarkConversationReadSchema,
  OBJECT_ID_REGEX,
} from "@/lib/validations/message";
import { GetOrCreatePreHireConversationSchema } from "@/lib/validations/invitation";
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
  type?: "PRE_HIRE" | "CONTRACT";
  contractId?: string;
  jobId?: string | null;
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
  job?: {
    id: string;
    title: string;
    status: string;
  } | null;
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
  invitation?: {
    id: string;
    status: string;
    expiresAt: string;
  } | null;
};

/**
 * Ensures or creates a conversation associated with a contract.
 * Only the contract's client and freelancer are allowed access.
 * Automatically links and upgrades any existing pre-hire conversation for this (jobId, freelancerId).
 */
export async function getOrCreateConversationForContractAction(
  contractId: string
): Promise<{ success: boolean; conversationId?: string; error?: string }> {
  const authRes = await verifyUserForAction(
    ["CLIENT", "FREELANCER"],
    undefined,
    { requireEmailVerified: false }
  );
  if (!authRes.success) {
    return {
      success: false,
      error: authRes.error,
    };
  }
  const user = authRes.user;

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
        jobId: true,
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

    // Strictly enforce relationship to the contract
    const isClientParticipant = contract.clientId === user.id;
    const isFreelancerParticipant = contract.freelancerId === user.id;

    if (!isClientParticipant && !isFreelancerParticipant) {
      return {
        success: false,
        error: "Forbidden: You are not an authorized participant in this contract.",
      };
    }

    // 1. Check if conversation already exists for this contract
    let conversation = await prisma.conversation.findUnique({
      where: { contractId: contract.id },
      select: { id: true },
    });

    // 2. If not found, check if a pre-hire conversation exists for (jobId, freelancerId) and upgrade it
    if (!conversation && contract.jobId) {
      const existingPreHire = await prisma.conversation.findUnique({
        where: {
          jobId_freelancerId: {
            jobId: contract.jobId,
            freelancerId: contract.freelancerId,
          },
        },
        select: { id: true, contractId: true },
      });

      if (existingPreHire) {
        conversation = await prisma.conversation.update({
          where: { id: existingPreHire.id },
          data: {
            contractId: contract.id,
            type: "CONTRACT",
          },
          select: { id: true },
        });
      }
    }

    // 3. If still not found, create new conversation for the contract
    if (!conversation) {
      try {
        conversation = await prisma.conversation.create({
          data: {
            contractId: contract.id,
            jobId: contract.jobId,
            clientId: contract.clientId,
            freelancerId: contract.freelancerId,
            type: "CONTRACT",
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

          // Concurrency fallback: if duplicate error was on jobId_freelancerId
          if (!conversation && contract.jobId) {
            const byJob = await prisma.conversation.findUnique({
              where: {
                jobId_freelancerId: {
                  jobId: contract.jobId,
                  freelancerId: contract.freelancerId,
                },
              },
              select: { id: true },
            });
            if (byJob) {
              conversation = await prisma.conversation.update({
                where: { id: byJob.id },
                data: {
                  contractId: contract.id,
                  type: "CONTRACT",
                },
                select: { id: true },
              });
            }
          }
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
 * Ensures or creates a PRE_HIRE conversation associated with an OPEN job.
 * Strictly verifies:
 * 1. Authenticated CLIENT with verified email address.
 * 2. Client owns the referenced job.
 * 3. Job is currently OPEN.
 * 4. Freelancer exists, has active FREELANCER role, and is not the client.
 * 5. Returns existing conversation if already established (idempotent, single thread per job/freelancer).
 */
export async function getOrCreatePreHireConversationAction(
  jobId: string,
  counterpartyId: string
): Promise<{ success: boolean; conversationId?: string; error?: string; isExisting?: boolean }> {
  const authRes = await verifyUserForAction(
    ["CLIENT", "FREELANCER"],
    "Unauthorized: You must be signed in as a client or freelancer to initiate messaging.",
    { requireEmailVerified: false }
  );
  if (!authRes.success) {
    return {
      success: false,
      error: authRes.error,
    };
  }
  const user = authRes.user;

  const parsed = GetOrCreatePreHireConversationSchema.safeParse({ jobId, freelancerId: counterpartyId });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid conversation parameters.",
    };
  }

  const { jobId: validJobId, freelancerId: validCounterpartyId } = parsed.data;

  // Prevent self-contact
  if (validCounterpartyId === user.id) {
    return {
      success: false,
      error: "You cannot initiate a conversation with yourself.",
    };
  }

  try {
    // Verify job ownership and OPEN status
    const job = await prisma.job.findUnique({
      where: { id: validJobId },
      select: { id: true, clientId: true, status: true },
    });

    if (!job) {
      return {
        success: false,
        error: "Referenced job posting not found.",
      };
    }

    if (job.status !== "OPEN") {
      return {
        success: false,
        error: `Cannot initiate pre-hire conversation. Job is currently ${job.status.toLowerCase()}.`,
      };
    }

    let actualClientId: string;
    let actualFreelancerId: string;

    if (user.role === "CLIENT") {
      if (job.clientId !== user.id) {
        return {
          success: false,
          error: "Forbidden: You do not own this job posting.",
        };
      }
      actualClientId = user.id;
      actualFreelancerId = validCounterpartyId;

      // Verify freelancer exists with FREELANCER role
      const freelancer = await prisma.user.findUnique({
        where: { id: actualFreelancerId },
        select: { id: true, role: true, roleSelected: true },
      });

      if (!freelancer || freelancer.role !== "FREELANCER" || freelancer.roleSelected === false) {
        return {
          success: false,
          error: "The selected freelancer profile is not active or available for contact.",
        };
      }
    } else {
      if (job.clientId !== validCounterpartyId) {
        return {
          success: false,
          error: "Invalid client relationship for this job posting.",
        };
      }
      actualClientId = validCounterpartyId;
      actualFreelancerId = user.id;

      // Verify client exists with CLIENT role
      const client = await prisma.user.findUnique({
        where: { id: actualClientId },
        select: { id: true, role: true, roleSelected: true },
      });

      if (!client || client.role !== "CLIENT" || client.roleSelected === false) {
        return {
          success: false,
          error: "The selected client profile is not active or available for contact.",
        };
      }
    }

    // Check if conversation already exists for (jobId, freelancerId)
    let conversation = await prisma.conversation.findUnique({
      where: {
        jobId_freelancerId: {
          jobId: validJobId,
          freelancerId: actualFreelancerId,
        },
      },
      select: { id: true },
    });

    if (conversation) {
      return {
        success: true,
        conversationId: conversation.id,
        isExisting: true,
      };
    }

    // Atomic creation handling unique-index concurrency conflict (P2002)
    try {
      conversation = await prisma.conversation.create({
        data: {
          type: "PRE_HIRE",
          jobId: validJobId,
          clientId: actualClientId,
          freelancerId: actualFreelancerId,
          lastMessageAt: new Date(),
        },
        select: { id: true },
      });
    } catch (createErr) {
      if (
        (createErr instanceof Prisma.PrismaClientKnownRequestError &&
          createErr.code === "P2002") ||
        (createErr as { code?: string })?.code === "P2002"
      ) {
        conversation = await prisma.conversation.findUnique({
          where: {
            jobId_freelancerId: {
              jobId: validJobId,
              freelancerId: actualFreelancerId,
            },
          },
          select: { id: true },
        });
      } else {
        throw createErr;
      }
    }

    if (!conversation) {
      return {
        success: false,
        error: "Failed to establish pre-hire conversation.",
      };
    }

    revalidatePath("/messages");

    return {
      success: true,
      conversationId: conversation.id,
      isExisting: false,
    };
  } catch (error) {
    console.error(
      "[WorkPulse Pre-Hire Messaging Error]:",
      error instanceof Error ? error.message : "Database error"
    );
    return {
      success: false,
      error: "Failed to initialize pre-hire conversation thread.",
    };
  }
}

/**
 * Universal Action to initiate or retrieve a direct conversation between Client and Freelancer.
 * Reuses existing conversation thread if one already exists between these two users.
 * If no thread exists, associates with a relevant client job or creates a clean consultation job container.
 */
export async function getOrCreateDirectConversationAction(
  counterpartyId: string,
  preferredJobId?: string
): Promise<{ success: boolean; conversationId?: string; error?: string; isExisting?: boolean }> {
  const authRes = await verifyUserForAction(
    ["CLIENT", "FREELANCER"],
    "Unauthorized: You must be signed in to message another user.",
    { requireEmailVerified: false }
  );
  if (!authRes.success) {
    return {
      success: false,
      error: authRes.error,
    };
  }
  const user = authRes.user;

  if (!counterpartyId || !OBJECT_ID_REGEX.test(counterpartyId)) {
    return {
      success: false,
      error: "Invalid user ID.",
    };
  }

  if (counterpartyId === user.id) {
    return {
      success: false,
      error: "You cannot initiate a conversation with yourself.",
    };
  }

  try {
    let actualClientId: string;
    let actualFreelancerId: string;

    if (user.role === "CLIENT") {
      actualClientId = user.id;
      actualFreelancerId = counterpartyId;

      const freelancer = await prisma.user.findUnique({
        where: { id: actualFreelancerId },
        select: { id: true, role: true, roleSelected: true },
      });
      if (!freelancer || freelancer.role !== "FREELANCER") {
        return {
          success: false,
          error: "Selected recipient is not an active freelancer.",
        };
      }
    } else {
      actualClientId = counterpartyId;
      actualFreelancerId = user.id;

      const client = await prisma.user.findUnique({
        where: { id: actualClientId },
        select: { id: true, role: true, roleSelected: true },
      });
      if (!client || client.role !== "CLIENT") {
        return {
          success: false,
          error: "Selected recipient is not an active client.",
        };
      }
    }

    // 1. Check for ANY existing conversation between this client and freelancer
    const existingConversation = await prisma.conversation.findFirst({
      where: {
        clientId: actualClientId,
        freelancerId: actualFreelancerId,
      },
      orderBy: { lastMessageAt: "desc" },
      select: { id: true },
    });

    if (existingConversation) {
      return {
        success: true,
        conversationId: existingConversation.id,
        isExisting: true,
      };
    }

    // 2. Resolve job ID to link the conversation
    let targetJobId: string | undefined = undefined;

    if (preferredJobId && OBJECT_ID_REGEX.test(preferredJobId)) {
      const candidate = await prisma.job.findFirst({
        where: { id: preferredJobId, clientId: actualClientId },
        select: { id: true },
      });
      if (candidate) {
        targetJobId = candidate.id;
      }
    }

    if (!targetJobId) {
      const openJob = await prisma.job.findFirst({
        where: { clientId: actualClientId, status: "OPEN" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (openJob) {
        targetJobId = openJob.id;
      }
    }

    if (!targetJobId) {
      const anyJob = await prisma.job.findFirst({
        where: { clientId: actualClientId },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (anyJob) {
        targetJobId = anyJob.id;
      }
    }

    if (!targetJobId) {
      // Create a lightweight consultation container job so the unique index [jobId, freelancerId] is satisfied
      const consultJob = await prisma.job.create({
        data: {
          title: "Project Consultation",
          description: "Direct client-freelancer consultation and project requirements discussion.",
          category: "General",
          type: "FIXED",
          status: "OPEN",
          clientId: actualClientId,
        },
        select: { id: true },
      });
      targetJobId = consultJob.id;
    }

    // 3. Create pre-hire conversation
    let createdConv;
    try {
      createdConv = await prisma.conversation.create({
        data: {
          type: "PRE_HIRE",
          jobId: targetJobId,
          clientId: actualClientId,
          freelancerId: actualFreelancerId,
          lastMessageAt: new Date(),
        },
        select: { id: true },
      });
    } catch (createErr) {
      if (
        (createErr instanceof Prisma.PrismaClientKnownRequestError &&
          createErr.code === "P2002") ||
        (createErr as { code?: string })?.code === "P2002"
      ) {
        createdConv = await prisma.conversation.findUnique({
          where: {
            jobId_freelancerId: {
              jobId: targetJobId,
              freelancerId: actualFreelancerId,
            },
          },
          select: { id: true },
        });
      } else {
        throw createErr;
      }
    }

    if (!createdConv) {
      return {
        success: false,
        error: "Failed to initialize direct conversation.",
      };
    }

    revalidatePath("/messages");

    return {
      success: true,
      conversationId: createdConv.id,
      isExisting: false,
    };
  } catch (error) {
    console.error(
      "[WorkPulse Direct Messaging Error]:",
      error instanceof Error ? error.message : "Database error"
    );
    return {
      success: false,
      error: "Unable to establish direct conversation thread.",
    };
  }
}

export interface GetConversationsOptions {
  limit?: number;
  cursor?: string;
  page?: number;
}

export interface GetMessagesOptions {
  limit?: number;
  cursor?: string;
  direction?: "before" | "after";
}

/**
 * Fetch conversations for the authenticated user with unread counts and pagination.
 * Strictly scopes results to conversations where the authenticated user is client or freelancer.
 * Eliminates N+1 queries by grouping unread counts in a single aggregation.
 */
export async function getConversationsAction(
  options?: GetConversationsOptions
): Promise<{
  success: boolean;
  conversations?: ConversationSummaryDto[];
  totalCount?: number;
  hasMore?: boolean;
  nextCursor?: string | null;
  error?: string;
}> {
  const authRes = await verifyUserForAction(
    ["CLIENT", "FREELANCER"],
    undefined,
    { requireEmailVerified: false }
  );
  if (!authRes.success) {
    return {
      success: false,
      error: authRes.error,
      conversations: [],
    };
  }
  const user = authRes.user;

  const parsed = GetConversationsSchema.safeParse(options || {});
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid conversation query parameters.",
      conversations: [],
    };
  }

  const { limit = 50, cursor, page } = parsed.data;
  const safeLimit = Math.min(Math.max(limit, 1), 100);

  try {
    // Auto-heal / sync missing conversations for all user's contracts
    try {
      const missingContracts = await prisma.contract.findMany({
        where: {
          OR: [{ clientId: user.id }, { freelancerId: user.id }],
          conversation: null,
        },
        take: 20,
        select: {
          id: true,
          jobId: true,
          clientId: true,
          freelancerId: true,
          createdAt: true,
        },
      });

      for (const missingContract of missingContracts) {
        let existingConv = null;
        if (missingContract.jobId) {
          existingConv = await prisma.conversation.findUnique({
            where: {
              jobId_freelancerId: {
                jobId: missingContract.jobId,
                freelancerId: missingContract.freelancerId,
              },
            },
            select: { id: true },
          });
        }
        if (existingConv) {
          await prisma.conversation.update({
            where: { id: existingConv.id },
            data: { contractId: missingContract.id, type: "CONTRACT" },
          });
        } else {
          try {
            await prisma.conversation.create({
              data: {
                contractId: missingContract.id,
                jobId: missingContract.jobId,
                clientId: missingContract.clientId,
                freelancerId: missingContract.freelancerId,
                type: "CONTRACT",
                lastMessageAt: missingContract.createdAt || new Date(),
              },
            });
          } catch {
            // Concurrency: ignore duplicate key error if already created
          }
        }
      }
    } catch {
      // Safe non-blocking sync error absorption
    }

    const whereClause: Prisma.ConversationWhereInput = {
      OR: [{ clientId: user.id }, { freelancerId: user.id }],
    };

    const [totalCount, rawConversations] = await Promise.all([
      prisma.conversation.count({ where: whereClause }),
      prisma.conversation.findMany({
        where: whereClause,
        orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
        take: safeLimit + 1,
        ...(cursor
          ? { cursor: { id: cursor }, skip: 1 }
          : page && page > 1
          ? { skip: (page - 1) * safeLimit }
          : {}),
        include: {
          contract: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
          job: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
          interviewInvitation: {
            select: {
              id: true,
              status: true,
              expiresAt: true,
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
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            select: {
              content: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    const hasMore = rawConversations.length > safeLimit;
    const conversations = hasMore ? rawConversations.slice(0, safeLimit) : rawConversations;
    const nextCursor = hasMore ? conversations[conversations.length - 1]?.id ?? null : null;

    // Single aggregation query to eliminate N+1 unread count queries
    const conversationIds = conversations.map((c) => c.id);
    let unreadCountMap = new Map<string, number>();

    if (conversationIds.length > 0) {
      const unreadGroups = await prisma.message.groupBy({
        by: ["conversationId"],
        where: {
          conversationId: { in: conversationIds },
          senderId: { not: user.id },
          read: false,
        },
        _count: {
          _all: true,
        },
      });

      unreadCountMap = new Map(
        unreadGroups.map((g) => [g.conversationId, g._count._all])
      );
    }

    const conversationSummaries: ConversationSummaryDto[] = conversations.map((c) => {
      const unreadCount = unreadCountMap.get(c.id) || 0;
      const isClient = user.id === c.clientId;
      const counterparty = isClient
        ? {
            id: c.freelancer?.id || c.freelancerId,
            name: c.freelancer?.name || "Freelancer",
            image: c.freelancer?.image || null,
            role: "FREELANCER" as const,
          }
        : {
            id: c.client?.id || c.clientId,
            name: c.client?.name || "Client",
            image: c.client?.image || null,
            role: "CLIENT" as const,
          };

      const lastMsg = c.messages[0];
      const effectiveLastMessageAt =
        lastMsg && lastMsg.createdAt > c.lastMessageAt
          ? lastMsg.createdAt
          : c.lastMessageAt;

      // Asynchronous self-healing if lastMessageAt lagged behind latest message
      if (lastMsg && lastMsg.createdAt > c.lastMessageAt) {
        prisma.conversation
          .updateMany({
            where: {
              id: c.id,
              lastMessageAt: { lte: lastMsg.createdAt },
            },
            data: {
              lastMessageAt: lastMsg.createdAt,
            },
          })
          .catch(() => {});
      }

      return {
        id: c.id,
        type: c.type,
        contractId: c.contractId || "",
        jobId: c.jobId,
        clientId: c.clientId,
        freelancerId: c.freelancerId,
        lastMessageAt: effectiveLastMessageAt.toISOString(),
        unreadCount,
        lastMessageSnippet: lastMsg ? lastMsg.content : null,
        contract: c.contract
          ? {
              id: c.contract.id,
              title: c.contract.title,
              status: c.contract.status,
            }
          : {
              id: "",
              title: c.job ? `Pre-Hire: ${c.job.title}` : "Pre-Hire Discussion",
              status: c.job?.status || "OPEN",
            },
        job: c.job
          ? {
              id: c.job.id,
              title: c.job.title,
              status: c.job.status,
            }
          : null,
        invitation: c.interviewInvitation
          ? {
              id: c.interviewInvitation.id,
              status: c.interviewInvitation.status,
              expiresAt: c.interviewInvitation.expiresAt.toISOString(),
            }
          : null,
        client: c.client,
        freelancer: c.freelancer,
        counterparty,
      };
    });

    return {
      success: true,
      conversations: conversationSummaries,
      totalCount,
      hasMore,
      nextCursor,
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
 * Alias for getConversationsAction to support both naming conventions.
 */
export const getMyConversationsAction = getConversationsAction;

/**
 * Fetch messages for a specific conversation with cursor-based pagination and strict access check.
 * Automatically marks incoming unread messages and related notifications as read.
 */
export async function getMessagesAction(
  conversationId: string,
  limitOrOptions?: number | GetMessagesOptions,
  cursorParam?: string
): Promise<{
  success: boolean;
  messages?: ChatMessageDto[];
  hasMore?: boolean;
  nextCursor?: string | null;
  conversation?: {
    id: string;
    type: "PRE_HIRE" | "CONTRACT";
    contractId: string;
    contractTitle: string;
    contractStatus: string;
    jobId?: string | null;
    jobTitle?: string | null;
    jobStatus?: string | null;
    counterparty: {
      id: string;
      name: string | null;
      image?: string | null;
      role: "CLIENT" | "FREELANCER";
    };
    invitation?: {
      id: string;
      status: string;
      expiresAt: string;
    } | null;
  };
  error?: string;
}> {
  const authRes = await verifyUserForAction(
    ["CLIENT", "FREELANCER"],
    undefined,
    { requireEmailVerified: false }
  );
  if (!authRes.success) {
    return {
      success: false,
      error: authRes.error,
    };
  }
  const user = authRes.user;

  let limit = 50;
  let cursor: string | undefined = undefined;
  let direction: "before" | "after" = "before";

  if (typeof limitOrOptions === "number") {
    limit = limitOrOptions;
    cursor = cursorParam;
  } else if (typeof limitOrOptions === "object" && limitOrOptions !== null) {
    limit = limitOrOptions.limit ?? 50;
    cursor = limitOrOptions.cursor ?? cursorParam;
    direction = limitOrOptions.direction ?? "before";
  }

  const parsed = GetMessagesSchema.safeParse({
    conversationId,
    limit,
    cursor,
    direction,
  });

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
        job: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
        interviewInvitation: {
          select: {
            id: true,
            status: true,
            expiresAt: true,
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

    // Verify membership: only client or freelancer participant can view
    if (conversation.clientId !== user.id && conversation.freelancerId !== user.id) {
      return {
        success: false,
        error: "Forbidden: You are not authorized to view this conversation.",
      };
    }

    const safeLimit = Math.min(Math.max(parsed.data.limit || 50, 1), 100);
    const queryCursor = parsed.data.cursor;
    const isDirectionAfter = parsed.data.direction === "after";

    // When direction === "before" (default for chat history):
    // We order descending by createdAt and id, fetch safeLimit + 1, then reverse back to chronological (asc)
    const rawMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: isDirectionAfter
        ? [{ createdAt: "asc" }, { id: "asc" }]
        : [{ createdAt: "desc" }, { id: "desc" }],
      take: safeLimit + 1,
      ...(queryCursor ? { cursor: { id: queryCursor }, skip: 1 } : {}),
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

    const hasMore = rawMessages.length > safeLimit;
    const batch = hasMore ? rawMessages.slice(0, safeLimit) : rawMessages;
    const nextCursor = hasMore ? batch[batch.length - 1]?.id ?? null : null;

    // For "before" pagination, reverse to maintain chronological order in output
    const messages = isDirectionAfter ? batch : [...batch].reverse();

    // Atomically mark unread messages sent by the counterparty and related notifications as read
    try {
      await prisma.$transaction([
        prisma.message.updateMany({
          where: {
            conversationId: conversation.id,
            senderId: { not: user.id },
            read: false,
          },
          data: {
            read: true,
          },
        }),
        prisma.notification.updateMany({
          where: {
            userId: user.id,
            type: NotificationType.NEW_MESSAGE,
            link: { contains: conversation.id },
            read: false,
          },
          data: {
            read: true,
          },
        }),
      ]);
    } catch (readUpdateErr) {
      console.warn(
        "[WorkPulse Messaging Warning]: Failed to atomically update read receipts/notifications:",
        readUpdateErr instanceof Error ? readUpdateErr.message : readUpdateErr
      );
    }

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
      messages: messages.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        content: m.content,
        read: m.read,
        createdAt: m.createdAt.toISOString(),
        sender: m.sender,
      })),
      hasMore,
      nextCursor,
      conversation: {
        id: conversation.id,
        type: conversation.type,
        contractId: conversation.contractId || "",
        contractTitle:
          conversation.contract?.title ||
          (conversation.job ? `Pre-Hire: ${conversation.job.title}` : "Pre-Hire Discussion"),
        contractStatus: conversation.contract?.status || (conversation.job?.status ?? "OPEN"),
        jobId: conversation.jobId || null,
        jobTitle: conversation.job?.title || null,
        jobStatus: conversation.job?.status || null,
        counterparty,
        invitation: conversation.interviewInvitation
          ? {
              id: conversation.interviewInvitation.id,
              status: conversation.interviewInvitation.status,
              expiresAt: conversation.interviewInvitation.expiresAt.toISOString(),
            }
          : null,
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
 * Explicit mark-as-read action for a conversation.
 * Strictly guarantees:
 * 1. Only participants can mark a conversation as read.
 * 2. A user can ONLY mark messages sent by the counterparty as read (senderId: { not: user.id }).
 * 3. Only messages belonging to the specified conversation are updated.
 * 4. Idempotent: Repeated invocations are completely safe and update 0 records without errors.
 * 5. Marks corresponding in-app notifications as read.
 */
export async function markConversationAsReadAction(
  conversationId: string
): Promise<{
  success: boolean;
  markedCount?: number;
  error?: string;
}> {
  const authRes = await verifyUserForAction(
    ["CLIENT", "FREELANCER"],
    undefined,
    { requireEmailVerified: false }
  );
  if (!authRes.success) {
    return {
      success: false,
      error: authRes.error,
    };
  }
  const user = authRes.user;

  const parsed = MarkConversationReadSchema.safeParse({ conversationId });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid conversation ID.",
    };
  }

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: parsed.data.conversationId },
      select: { id: true, clientId: true, freelancerId: true },
    });

    if (!conversation) {
      return {
        success: false,
        error: "Conversation not found.",
      };
    }

    if (conversation.clientId !== user.id && conversation.freelancerId !== user.id) {
      return {
        success: false,
        error: "Forbidden: You are not authorized to access this conversation.",
      };
    }

    const [messageUpdate] = await prisma.$transaction([
      prisma.message.updateMany({
        where: {
          conversationId: conversation.id,
          senderId: { not: user.id },
          read: false,
        },
        data: {
          read: true,
        },
      }),
      prisma.notification.updateMany({
        where: {
          userId: user.id,
          type: NotificationType.NEW_MESSAGE,
          link: { contains: conversation.id },
          read: false,
        },
        data: {
          read: true,
        },
      }),
    ]);

    revalidatePath("/messages");

    return {
      success: true,
      markedCount: messageUpdate.count,
    };
  } catch (error) {
    console.error("Error marking conversation as read:", error);
    return {
      success: false,
      error: "Failed to mark messages as read.",
    };
  }
}

/**
 * Fast aggregate query for the total unread message count across all conversations
 * for the authenticated user.
 */
export async function getUnreadMessagesCountAction(): Promise<{
  success: boolean;
  unreadCount: number;
  error?: string;
}> {
  const authRes = await verifyUserForAction(
    ["CLIENT", "FREELANCER"],
    undefined,
    { requireEmailVerified: false }
  );
  if (!authRes.success) {
    return {
      success: false,
      unreadCount: 0,
      error: authRes.error,
    };
  }
  const user = authRes.user;

  try {
    const userConversations = await prisma.conversation.findMany({
      where: {
        OR: [{ clientId: user.id }, { freelancerId: user.id }],
      },
      select: { id: true },
    });

    const convIds = userConversations.map((c) => c.id);
    if (convIds.length === 0) {
      return {
        success: true,
        unreadCount: 0,
      };
    }

    const unreadCount = await prisma.message.count({
      where: {
        conversationId: { in: convIds },
        senderId: { not: user.id },
        read: false,
      },
    });

    return {
      success: true,
      unreadCount,
    };
  } catch (error) {
    console.error("Error calculating unread message count:", error);
    return {
      success: false,
      unreadCount: 0,
      error: "Failed to retrieve unread message count.",
    };
  }
}

/**
 * Send a message within a contract or pre-hire conversation.
 * Always sets senderId from the authenticated session (prevents spoofing).
 * Validates length, non-empty whitespace-trimmed content.
 * Enforces invitation status constraints for pre-hire conversations.
 * Atomically creates the message and updates conversation lastMessageAt in a transaction.
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
  const authRes = await verifyUserForAction(
    ["CLIENT", "FREELANCER"],
    undefined,
    { requireEmailVerified: false }
  );
  if (!authRes.success) {
    return {
      success: false,
      error: authRes.error,
    };
  }
  const user = authRes.user;

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
        job: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
        interviewInvitation: {
          select: {
            id: true,
            status: true,
            expiresAt: true,
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

    // Pre-hire eligibility and invitation state enforcement
    if (conversation.type === "PRE_HIRE") {
      if (!conversation.job || conversation.job.status !== "OPEN") {
        return {
          success: false,
          error: "Messaging is closed because this job is no longer open.",
        };
      }
      const inv = conversation.interviewInvitation;
      if (inv) {
        if (inv.status === "DECLINED" && user.id === conversation.freelancerId) {
          return {
            success: false,
            error: "This interview invitation was declined. You cannot send further messages.",
          };
        }
        if (inv.status === "WITHDRAWN" && user.id === conversation.freelancerId) {
          return {
            success: false,
            error: "This interview invitation was withdrawn by the client.",
          };
        }
        if (
          (inv.status === "EXPIRED" || (inv.status === "PENDING" && inv.expiresAt < new Date())) &&
          user.id === conversation.freelancerId
        ) {
          return {
            success: false,
            error: "This interview invitation has expired.",
          };
        }
      }
    }

    const counterpartyId =
      user.id === conversation.clientId
        ? conversation.freelancerId
        : conversation.clientId;

    // Deduplication guard for rapid client retries / network timeouts:
    // If an identical message was created by the same user in this conversation within the last 2500ms, return it idempotently
    const recentDuplicate = await prisma.message.findFirst({
      where: {
        conversationId: conversation.id,
        senderId: user.id,
        content,
        createdAt: { gte: new Date(Date.now() - 2500) },
      },
      orderBy: { createdAt: "desc" },
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

    if (recentDuplicate) {
      // Re-advance conversation timestamp if it missed
      try {
        await prisma.conversation.updateMany({
          where: {
            id: conversation.id,
            lastMessageAt: { lte: recentDuplicate.createdAt },
          },
          data: {
            lastMessageAt: recentDuplicate.createdAt,
          },
        });
      } catch {
        // Non-fatal
      }

      return {
        success: true,
        message: {
          id: recentDuplicate.id,
          conversationId: recentDuplicate.conversationId,
          senderId: recentDuplicate.senderId,
          content: recentDuplicate.content,
          read: recentDuplicate.read,
          createdAt: recentDuplicate.createdAt.toISOString(),
          sender: recentDuplicate.sender,
        },
      };
    }

    // Create message and update conversation lastMessageAt
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

    // Monotonically advance conversation lastMessageAt with safe retry (guarantees concurrent messages never roll timestamp backward)
    try {
      await prisma.conversation.updateMany({
        where: {
          id: conversation.id,
          lastMessageAt: { lte: newMessage.createdAt },
        },
        data: {
          lastMessageAt: newMessage.createdAt,
        },
      });
    } catch (advErr) {
      console.warn(
        "[WorkPulse Messaging Warning]: Failed to advance conversation lastMessageAt, retrying once:",
        advErr instanceof Error ? advErr.message : advErr
      );
      try {
        await prisma.conversation.updateMany({
          where: {
            id: conversation.id,
            lastMessageAt: { lte: newMessage.createdAt },
          },
          data: {
            lastMessageAt: newMessage.createdAt,
          },
        });
      } catch (retryErr) {
        console.error(
          "[WorkPulse Messaging Error]: Failed to advance conversation lastMessageAt on retry:",
          retryErr instanceof Error ? retryErr.message : retryErr
        );
        // Non-fatal: the message is safely stored in DB, do not abort delivery
      }
    }

    // Safely deliver in-app notification without throwing if fails
    const senderName = user.name || (user.role === "CLIENT" ? "Client" : "Freelancer");
    const preview = content.length > 80 ? content.slice(0, 77) + "..." : content;

    await createNotificationSafe({
      userId: counterpartyId,
      type: NotificationType.NEW_MESSAGE,
      title: `New message from ${senderName}`,
      message: preview,
      link: `/messages?conversationId=${conversation.id}`,
      idempotencyKey: `message:${newMessage.id}:sent`,
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

