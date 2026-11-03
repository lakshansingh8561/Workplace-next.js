/* eslint-disable @typescript-eslint/no-explicit-any */
// src/tests/integration/invitation-prehire.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PrismaClient,
  Role,
  JobStatus,
  PaymentType,
  ConversationType,
  InvitationStatus,
  Prisma,
} from "@prisma/client";

const isIntegrationRun = process.env.WORKPULSE_INTEGRATION_RUN === "true";
const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  "mongodb://127.0.0.1:27018/workpulse_test?replicaSet=rsTest&directConnection=true";

describe("WorkPulse Phase 3 Batch 2: Real MongoDB Replica Set Integration Tests", () => {
  if (!isIntegrationRun) {
    it.skip("skips database integration test during standard unit test run (run 'npm run test:integration')", () => {
      // Skipped during normal unit test execution
    });
    return;
  }

  let prisma: PrismaClient;
  let isReplicaSet = false;

  // Test ObjectIds
  const clientId = "67a000000000000000000001";
  const freelancerId = "67a000000000000000000002";
  const jobId1 = "67a000000000000000000011";
  const jobId2 = "67a000000000000000000012";
  const jobId3 = "67a000000000000000000013";
  const legacyContractId = "67a000000000000000000021";
  const legacyConversationId = "67a000000000000000000031";

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: testDbUrl,
        },
      },
    });

    try {
      const serverStatus = (await prisma.$runCommandRaw({ hello: 1 })) as {
        setName?: string;
        isWritablePrimary?: boolean;
      };
      if (serverStatus.setName) {
        isReplicaSet = true;
      }
    } catch (err) {
      console.warn("[Integration Test Setup] Server check:", err);
    }

    // Deploy compound unique index on conversations
    try {
      await prisma.$runCommandRaw({
        createIndexes: "conversations",
        indexes: [
          {
            key: { jobId: 1, freelancerId: 1 },
            name: "conversations_jobId_freelancerId_unique",
            unique: true,
          },
        ],
      });
    } catch {
      // Index may already exist
    }

    // Deploy partial unique index for contractId (strictly excludes null and missing values)
    try {
      await prisma.$runCommandRaw({
        dropIndexes: "conversations",
        index: "conversations_contractId_key",
      });
    } catch {}
    try {
      await prisma.$runCommandRaw({
        createIndexes: "conversations",
        indexes: [
          {
            key: { contractId: 1 },
            name: "conversations_contractId_key",
            unique: true,
            partialFilterExpression: {
              contractId: { $type: "objectId" },
            },
          },
        ],
      });
    } catch {}

    // Deploy interview_invitations indexes
    try {
      await prisma.$runCommandRaw({
        createIndexes: "interview_invitations",
        indexes: [
          {
            key: { jobId: 1, freelancerId: 1 },
            name: "invitations_jobId_freelancerId_unique",
            unique: true,
          },
          {
            key: { freelancerId: 1, status: 1 },
            name: "invitations_freelancerId_status_idx",
          },
          {
            key: { clientId: 1, status: 1 },
            name: "invitations_clientId_status_idx",
          },
          {
            key: { jobId: 1 },
            name: "invitations_jobId_idx",
          },
        ],
      });
    } catch {
      // Indexes may already exist
    }

    await cleanup();
    await seedFixtures();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  async function cleanup() {
    try {
      await prisma.message.deleteMany({
        where: {
          senderId: { in: [clientId, freelancerId] },
        },
      });
      await prisma.interviewInvitation.deleteMany({
        where: {
          OR: [{ clientId }, { freelancerId }],
        },
      });
      await prisma.conversation.deleteMany({
        where: {
          OR: [{ clientId }, { freelancerId }],
        },
      });
      await prisma.contract.deleteMany({
        where: {
          OR: [{ clientId }, { freelancerId }],
        },
      });
      await prisma.proposal.deleteMany({
        where: { freelancerId },
      });
      await prisma.job.deleteMany({
        where: { clientId },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [clientId, freelancerId] } },
      });
    } catch (e) {
      console.warn("[Integration Test Cleanup] Non-fatal cleanup error:", e);
    }
  }

  async function seedFixtures() {
    // 1. Client user
    await prisma.user.create({
      data: {
        id: clientId,
        email: "integration_client@workpulse.internal",
        name: "Acme Client Corp",
        role: Role.CLIENT,
        roleSelected: true,
        emailVerified: new Date(),
      },
    });

    // 2. Freelancer user
    await prisma.user.create({
      data: {
        id: freelancerId,
        email: "integration_freelancer@workpulse.internal",
        name: "Bob FullStack",
        role: Role.FREELANCER,
        roleSelected: true,
        emailVerified: new Date(),
      },
    });

    // 3. Test Jobs
    await prisma.job.create({
      data: {
        id: jobId1,
        clientId,
        title: "Full-Stack Next.js Developer",
        description: "Need an expert to build scalable systems",
        category: "Web Development",
        type: PaymentType.FIXED,
        budget: 5000,
        status: JobStatus.OPEN,
      },
    });

    await prisma.job.create({
      data: {
        id: jobId2,
        clientId,
        title: "Backend MongoDB Architect",
        description: "Replica set concurrency expert",
        category: "Databases",
        type: PaymentType.HOURLY,
        hourlyMin: 70,
        hourlyMax: 100,
        status: JobStatus.OPEN,
      },
    });

    await prisma.job.create({
      data: {
        id: jobId3,
        clientId,
        title: "Closed Legacy Position",
        description: "Historic job posting",
        category: "DevOps",
        type: PaymentType.FIXED,
        budget: 2000,
        status: JobStatus.CLOSED,
      },
    });

    // 4. Pre-existing Contract Conversation (Legacy)
    const legacyProposalId = "67a000000000000000000019";
    await prisma.proposal.create({
      data: {
        id: legacyProposalId,
        jobId: jobId3,
        freelancerId,
        coverLetter: "Legacy proposal",
        bidAmount: 2000,
        status: "ACCEPTED",
      },
    });

    await prisma.contract.create({
      data: {
        id: legacyContractId,
        jobId: jobId3,
        proposalId: legacyProposalId,
        clientId,
        freelancerId,
        title: "Legacy Fixed Milestone Contract",
        totalAmount: 2000,
        status: "ACTIVE",
      },
    });

    await prisma.conversation.create({
      data: {
        id: legacyConversationId,
        type: ConversationType.CONTRACT,
        contractId: legacyContractId,
        jobId: jobId3,
        clientId,
        freelancerId,
        lastMessageAt: new Date("2025-01-01T12:00:00Z"),
      },
    });

    await prisma.message.create({
      data: {
        id: "67a000000000000000000041",
        conversationId: legacyConversationId,
        senderId: clientId,
        content: "Welcome to the contract! Here is the kickoff brief.",
        createdAt: new Date("2025-01-01T12:00:00Z"),
      },
    });

    await prisma.message.create({
      data: {
        id: "67a000000000000000000042",
        conversationId: legacyConversationId,
        senderId: freelancerId,
        content: "Received! Commencing Phase 1 milestones now.",
        createdAt: new Date("2025-01-01T12:05:00Z"),
      },
    });
  }

  it("verifies test environment is connected to replica set", () => {
    expect(isReplicaSet).toBe(true);
  });

  describe("1. Partial Unique Index Behavior on contractId", () => {
    it("allows multiple pre-hire conversations with explicit null contractId without collision", async () => {
      const convNull1 = await prisma.conversation.create({
        data: {
          type: ConversationType.PRE_HIRE,
          jobId: jobId1,
          clientId,
          freelancerId,
          contractId: null,
        },
      });

      // Different freelancer for same client & job
      const freelancer2Id = "67a000000000000000000088";
      await prisma.user.create({
        data: {
          id: freelancer2Id,
          email: "freelancer2@workpulse.internal",
          name: "Freelancer Two",
          role: Role.FREELANCER,
        },
      });

      const convNull2 = await prisma.conversation.create({
        data: {
          type: ConversationType.PRE_HIRE,
          jobId: jobId1,
          clientId,
          freelancerId: freelancer2Id,
          contractId: null,
        },
      });

      expect(convNull1.id).toBeDefined();
      expect(convNull2.id).toBeDefined();
      expect(convNull1.id).not.toBe(convNull2.id);

      // Cleanup extra user & conversation
      await prisma.conversation.delete({ where: { id: convNull2.id } });
      await prisma.user.delete({ where: { id: freelancer2Id } });
    });

    it("allows multiple conversations with missing contractId (omitted field)", async () => {
      // convNull1 exists; let's verify finding by contractId works
      const freelancer3Id = "67a000000000000000000089";
      await prisma.user.create({
        data: {
          id: freelancer3Id,
          email: "freelancer3@workpulse.internal",
          name: "Freelancer Three",
          role: Role.FREELANCER,
        },
      });

      const convMissing = await prisma.conversation.create({
        data: {
          type: ConversationType.PRE_HIRE,
          jobId: jobId1,
          clientId,
          freelancerId: freelancer3Id,
          // contractId is omitted
        },
      });

      expect(convMissing.id).toBeDefined();

      // Cleanup
      await prisma.conversation.delete({ where: { id: convMissing.id } });
      await prisma.user.delete({ where: { id: freelancer3Id } });
    });

    it("rejects duplicate non-null contractId via P2002 while allowing distinct contracts", async () => {
      // Legacy conversation already has legacyContractId
      let caughtP2002 = false;
      try {
        await prisma.conversation.create({
          data: {
            type: ConversationType.CONTRACT,
            contractId: legacyContractId,
            jobId: jobId2,
            clientId,
            freelancerId,
          },
        });
      } catch (err: any) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          caughtP2002 = true;
        }
      }
      expect(caughtP2002).toBe(true);
    });
  });

  describe("2. Atomic creation of conversation + invitation + initial message", () => {
    it("successfully creates conversation, invitation and message atomically in MongoDB replica set", async () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const invitationMessage = "Hello Bob! We loved your profile and want to interview you.";

      // Delete existing conv for (jobId1, freelancerId) to test clean atomic creation
      await prisma.conversation.deleteMany({
        where: { jobId: jobId1, freelancerId },
      });

      const result = await prisma.$transaction(async (tx) => {
        // 1. Create PRE_HIRE conversation
        const conv = await tx.conversation.create({
          data: {
            type: ConversationType.PRE_HIRE,
            jobId: jobId1,
            clientId,
            freelancerId,
            lastMessageAt: new Date(),
          },
        });

        // 2. Create InterviewInvitation
        const inv = await tx.interviewInvitation.create({
          data: {
            jobId: jobId1,
            clientId,
            freelancerId,
            conversationId: conv.id,
            message: invitationMessage,
            status: InvitationStatus.PENDING,
            expiresAt,
          },
        });

        // 3. Create initial message
        const msg = await tx.message.create({
          data: {
            conversationId: conv.id,
            senderId: clientId,
            content: invitationMessage,
          },
        });

        return { conversation: conv, invitation: inv, message: msg };
      });

      expect(result.conversation.id).toBeDefined();
      expect(result.conversation.type).toBe("PRE_HIRE");
      expect(result.conversation.jobId).toBe(jobId1);
      expect(result.invitation.status).toBe("PENDING");
      expect(result.invitation.conversationId).toBe(result.conversation.id);
      expect(result.message.conversationId).toBe(result.conversation.id);
      expect(result.message.content).toBe(invitationMessage);

      // Verify records in DB
      const dbConv = await prisma.conversation.findUnique({
        where: { id: result.conversation.id },
        include: { interviewInvitation: true, messages: true },
      });

      expect(dbConv).not.toBeNull();
      expect(dbConv?.interviewInvitation?.id).toBe(result.invitation.id);
      expect(dbConv?.messages.length).toBe(1);
    });
  });

  describe("3. Concurrent Duplicate Invitation Requests", () => {
    it("safely rejects concurrent duplicate invitations via unique index P2002", async () => {
      // jobId2 is open and has no invitation yet
      const createInvitationAttempt = async () => {
        return prisma.$transaction(async (tx) => {
          let conv = await tx.conversation.findUnique({
            where: {
              jobId_freelancerId: {
                jobId: jobId2,
                freelancerId,
              },
            },
          });
          if (!conv) {
            conv = await tx.conversation.create({
              data: {
                type: ConversationType.PRE_HIRE,
                jobId: jobId2,
                clientId,
                freelancerId,
              },
            });
          }

          const inv = await tx.interviewInvitation.create({
            data: {
              jobId: jobId2,
              clientId,
              freelancerId,
              conversationId: conv.id,
              message: "Concurrent test invitation",
              status: InvitationStatus.PENDING,
              expiresAt: new Date(Date.now() + 86400000),
            },
          });

          await tx.message.create({
            data: {
              conversationId: conv.id,
              senderId: clientId,
              content: "Concurrent test invitation",
            },
          });

          return inv;
        });
      };

      // Launch 2 parallel requests simultaneously
      const results = await Promise.allSettled([
        createInvitationAttempt(),
        createInvitationAttempt(),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // Verify exactly one invitation exists in MongoDB
      const count = await prisma.interviewInvitation.count({
        where: { jobId: jobId2, freelancerId },
      });
      expect(count).toBe(1);

      // Verify exactly one initial message exists
      const invInDb = await prisma.interviewInvitation.findUniqueOrThrow({
        where: { jobId_freelancerId: { jobId: jobId2, freelancerId } },
      });
      const msgCount = await prisma.message.count({
        where: { conversationId: invInDb.conversationId },
      });
      expect(msgCount).toBe(1);
    });
  });

  describe("4. Concurrent State Transitions: Accept vs. Withdraw", () => {
    it("proves competing accept and withdraw cannot both succeed; exactly one commits", async () => {
      const inv = await prisma.interviewInvitation.findUniqueOrThrow({
        where: { jobId_freelancerId: { jobId: jobId1, freelancerId } },
      });

      expect(inv.status).toBe(InvitationStatus.PENDING);

      // Operation A: Freelancer accepts via conditional atomic update
      const attemptAccept = async () => {
        return prisma.$transaction(async (tx) => {
          const res = await tx.interviewInvitation.updateMany({
            where: { id: inv.id, status: InvitationStatus.PENDING },
            data: { status: InvitationStatus.ACCEPTED, respondedAt: new Date() },
          });
          if (res.count === 0) {
            throw new Error("Cannot respond. Invitation is no longer pending.");
          }
          await tx.message.create({
            data: {
              conversationId: inv.conversationId,
              senderId: freelancerId,
              content: "[Accepted Interview]",
            },
          });
          return "ACCEPTED";
        });
      };

      // Operation B: Client withdraws via conditional atomic update
      const attemptWithdraw = async () => {
        return prisma.$transaction(async (tx) => {
          const res = await tx.interviewInvitation.updateMany({
            where: { id: inv.id, status: InvitationStatus.PENDING },
            data: { status: InvitationStatus.WITHDRAWN, respondedAt: new Date() },
          });
          if (res.count === 0) {
            throw new Error("Cannot withdraw invitation. It is no longer pending.");
          }
          await tx.message.create({
            data: {
              conversationId: inv.conversationId,
              senderId: clientId,
              content: "[Withdrawn by Client]",
            },
          });
          return "WITHDRAWN";
        });
      };

      // Execute simultaneously
      const results = await Promise.allSettled([attemptAccept(), attemptWithdraw()]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // Verify final status in MongoDB is consistent (either ACCEPTED or WITHDRAWN, never contradictory)
      const finalInv = await prisma.interviewInvitation.findUniqueOrThrow({
        where: { id: inv.id },
      });
      const winnerStatus = (fulfilled[0] as PromiseFulfilledResult<string>).value;
      expect(finalInv.status).toBe(winnerStatus);
      expect(finalInv.respondedAt).toBeInstanceOf(Date);

      // Exactly 1 new system message was created (plus the 1 initial message = 2 messages total)
      const totalMessages = await prisma.message.count({
        where: { conversationId: inv.conversationId },
      });
      expect(totalMessages).toBe(2);
    });
  });

  describe("5. Concurrent State Transitions: Accept vs. Decline", () => {
    it("proves competing accept and decline cannot both succeed", async () => {
      // Reset jobId2 invitation to PENDING
      const inv2 = await prisma.interviewInvitation.findUniqueOrThrow({
        where: { jobId_freelancerId: { jobId: jobId2, freelancerId } },
      });

      const attemptAccept = async () => {
        return prisma.$transaction(async (tx) => {
          const res = await tx.interviewInvitation.updateMany({
            where: { id: inv2.id, status: InvitationStatus.PENDING },
            data: { status: InvitationStatus.ACCEPTED, respondedAt: new Date() },
          });
          if (res.count === 0) throw new Error("No longer pending");
          return "ACCEPTED";
        });
      };

      const attemptDecline = async () => {
        return prisma.$transaction(async (tx) => {
          const res = await tx.interviewInvitation.updateMany({
            where: { id: inv2.id, status: InvitationStatus.PENDING },
            data: { status: InvitationStatus.DECLINED, respondedAt: new Date() },
          });
          if (res.count === 0) throw new Error("No longer pending");
          await tx.message.create({
            data: {
              conversationId: inv2.conversationId,
              senderId: freelancerId,
              content: "[Declined with reason: Not available]",
            },
          });
          return "DECLINED";
        });
      };

      const results = await Promise.allSettled([attemptAccept(), attemptDecline()]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const finalInv2 = await prisma.interviewInvitation.findUniqueOrThrow({
        where: { id: inv2.id },
      });
      const winner = (fulfilled[0] as PromiseFulfilledResult<string>).value;
      expect(finalInv2.status).toBe(winner);
    });
  });

  describe("6. Concurrent State Transitions: Two Simultaneous Accept Requests", () => {
    it("proves two simultaneous accept requests result in exactly one successful response", async () => {
      // Create a fresh test invitation
      const freshJob = await prisma.job.create({
        data: {
          clientId,
          title: "Double Accept Test Job",
          description: "Desc",
          category: "Dev",
          type: PaymentType.FIXED,
          budget: 100,
          status: JobStatus.OPEN,
        },
      });

      const conv = await prisma.conversation.create({
        data: {
          type: ConversationType.PRE_HIRE,
          jobId: freshJob.id,
          clientId,
          freelancerId,
        },
      });

      const inv = await prisma.interviewInvitation.create({
        data: {
          jobId: freshJob.id,
          clientId,
          freelancerId,
          conversationId: conv.id,
          message: "Interview invite",
          status: InvitationStatus.PENDING,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      const acceptCall = async () => {
        return prisma.$transaction(async (tx) => {
          const res = await tx.interviewInvitation.updateMany({
            where: { id: inv.id, status: InvitationStatus.PENDING },
            data: { status: InvitationStatus.ACCEPTED, respondedAt: new Date() },
          });
          if (res.count === 0) throw new Error("Already responded");
          return "ACCEPTED";
        });
      };

      const results = await Promise.allSettled([acceptCall(), acceptCall()]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const inDb = await prisma.interviewInvitation.findUniqueOrThrow({
        where: { id: inv.id },
      });
      expect(inDb.status).toBe(InvitationStatus.ACCEPTED);
    });
  });

  describe("7. Expiry vs. Acceptance", () => {
    it("prevents acceptance of an expired invitation and transitions to EXPIRED", async () => {
      const expiredJob = await prisma.job.create({
        data: {
          clientId,
          title: "Expired Test Job",
          description: "Desc",
          category: "Dev",
          type: PaymentType.FIXED,
          budget: 100,
          status: JobStatus.OPEN,
        },
      });

      const conv = await prisma.conversation.create({
        data: {
          type: ConversationType.PRE_HIRE,
          jobId: expiredJob.id,
          clientId,
          freelancerId,
        },
      });

      const pastExpiry = new Date(Date.now() - 60000); // 1 minute ago
      const expiredInv = await prisma.interviewInvitation.create({
        data: {
          jobId: expiredJob.id,
          clientId,
          freelancerId,
          conversationId: conv.id,
          message: "Expired invite",
          status: InvitationStatus.PENDING,
          expiresAt: pastExpiry,
        },
      });

      // Attempt response
      const respondAttempt = async () => {
        const found = await prisma.interviewInvitation.findUniqueOrThrow({
          where: { id: expiredInv.id },
        });

        if (found.expiresAt < new Date()) {
          await prisma.interviewInvitation.update({
            where: { id: found.id },
            data: { status: InvitationStatus.EXPIRED, respondedAt: new Date() },
          });
          throw new Error("This interview invitation has expired.");
        }

        return prisma.interviewInvitation.update({
          where: { id: found.id },
          data: { status: InvitationStatus.ACCEPTED },
        });
      };

      await expect(respondAttempt()).rejects.toThrow("This interview invitation has expired.");

      const inDb = await prisma.interviewInvitation.findUniqueOrThrow({
        where: { id: expiredInv.id },
      });
      expect(inDb.status).toBe(InvitationStatus.EXPIRED);
    });
  });

  describe("8. Existing Contract Conversations & Safe Contract Deletion", () => {
    it("loads legacy contract conversation with messages without schema degradation", async () => {
      const legacyConv = await prisma.conversation.findUnique({
        where: { id: legacyConversationId },
        include: {
          contract: true,
          job: true,
          messages: {
            orderBy: { createdAt: "asc" },
          },
        },
      });

      expect(legacyConv).not.toBeNull();
      expect(legacyConv?.type).toBe(ConversationType.CONTRACT);
      expect(legacyConv?.contractId).toBe(legacyContractId);
      expect(legacyConv?.contract?.title).toBe("Legacy Fixed Milestone Contract");
      expect(legacyConv?.messages.length).toBe(2);
      expect(legacyConv?.messages[0].content).toContain("Welcome to the contract!");
      expect(legacyConv?.messages[1].content).toContain("Commencing Phase 1 milestones");
    });

    it("verifies deleting contract sets contractId to null without deleting conversation or messages", async () => {
      const testJob = await prisma.job.create({
        data: {
          clientId,
          title: "Delete Safety Test Job",
          description: "Test description",
          category: "QA",
          type: PaymentType.FIXED,
          budget: 500,
          status: JobStatus.OPEN,
        },
      });

      const tempProposal = await prisma.proposal.create({
        data: {
          jobId: testJob.id,
          freelancerId,
          coverLetter: "Temporary proposal",
          bidAmount: 500,
          status: "ACCEPTED",
        },
      });

      const tempContract = await prisma.contract.create({
        data: {
          jobId: testJob.id,
          proposalId: tempProposal.id,
          clientId,
          freelancerId,
          title: "Temporary Test Contract",
          totalAmount: 500,
          status: "ACTIVE",
        },
      });

      const tempConv = await prisma.conversation.create({
        data: {
          type: ConversationType.CONTRACT,
          contractId: tempContract.id,
          jobId: testJob.id,
          clientId,
          freelancerId,
        },
      });

      const tempMsg = await prisma.message.create({
        data: {
          conversationId: tempConv.id,
          senderId: clientId,
          content: "Important discussion that must not be deleted",
        },
      });

      // Delete the contract
      await prisma.contract.delete({
        where: { id: tempContract.id },
      });

      // Conversation must still exist with contractId: null (handled cleanly by partialFilterExpression)
      const survivingConv = await prisma.conversation.findUnique({
        where: { id: tempConv.id },
      });
      expect(survivingConv).not.toBeNull();
      expect(survivingConv?.contractId).toBeNull();

      // Message must still exist completely intact
      const survivingMsg = await prisma.message.findUnique({
        where: { id: tempMsg.id },
      });
      expect(survivingMsg).not.toBeNull();
      expect(survivingMsg?.content).toBe("Important discussion that must not be deleted");
    });
  });
});
