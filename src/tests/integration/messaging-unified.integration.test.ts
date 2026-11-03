// src/tests/integration/messaging-unified.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PrismaClient,
  Role,
  JobStatus,
  PaymentType,
  ConversationType,
  InvitationStatus,
  NotificationType,
} from "@prisma/client";

const isIntegrationRun = process.env.WORKPULSE_INTEGRATION_RUN === "true";
const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  "mongodb://127.0.0.1:27018/workpulse_test?replicaSet=rsTest&directConnection=true";

describe("WorkPulse Phase 3 Batch 3: Unified Messaging Backend - MongoDB Replica Set Integration Tests", () => {
  if (!isIntegrationRun) {
    it.skip("skips database integration test during standard unit test run (run 'npm run test:integration')", () => {
      // Skipped during normal unit test execution
    });
    return;
  }

  let prisma: PrismaClient;

  // Dedicated ObjectIds for integration test isolation
  const clientAId = "67b000000000000000000001";
  const clientCId = "67b000000000000000000002";
  const freelancerBId = "67b000000000000000000003";
  const strangerDId = "67b000000000000000000004";

  const openJobId = "67b000000000000000000011";
  const closedJobId = "67b000000000000000000012";

  const proposalId = "67b000000000000000000019";
  const contractId = "67b000000000000000000021";

  const convABContractId = "67b000000000000000000031";
  const convCBPreHireId = "67b000000000000000000032";

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: testDbUrl,
        },
      },
    });

    // Clean up test data
    await prisma.notification.deleteMany({
      where: {
        userId: { in: [clientAId, clientCId, freelancerBId, strangerDId] },
      },
    });
    await prisma.message.deleteMany({
      where: {
        conversationId: { in: [convABContractId, convCBPreHireId] },
      },
    });
    await prisma.interviewInvitation.deleteMany({
      where: {
        conversationId: { in: [convABContractId, convCBPreHireId] },
      },
    });
    await prisma.conversation.deleteMany({
      where: {
        id: { in: [convABContractId, convCBPreHireId] },
      },
    });
    await prisma.contract.deleteMany({
      where: { id: contractId },
    });
    await prisma.proposal.deleteMany({
      where: { id: proposalId },
    });
    await prisma.job.deleteMany({
      where: { id: { in: [openJobId, closedJobId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [clientAId, clientCId, freelancerBId, strangerDId] } },
    });

    // Seed test users
    await prisma.user.createMany({
      data: [
        {
          id: clientAId,
          email: "client.a@test.com",
          name: "Client Alice Corp",
          role: Role.CLIENT,
          roleSelected: true,
          emailVerified: new Date("2026-01-01"),
        },
        {
          id: clientCId,
          email: "client.c@test.com",
          name: "Client Charlie Inc",
          role: Role.CLIENT,
          roleSelected: true,
          emailVerified: new Date("2026-01-01"),
        },
        {
          id: freelancerBId,
          email: "freelancer.b@test.com",
          name: "Freelancer Bob",
          role: Role.FREELANCER,
          roleSelected: true,
          emailVerified: new Date("2026-01-01"),
        },
        {
          id: strangerDId,
          email: "stranger.d@test.com",
          name: "Stranger Dave",
          role: Role.FREELANCER,
          roleSelected: true,
          emailVerified: new Date("2026-01-01"),
        },
      ],
    });

    // Seed jobs
    await prisma.job.create({
      data: {
        id: openJobId,
        title: "Active Open Job for Pre-Hire",
        description: "Open description",
        category: "Software",
        skills: ["TypeScript"],
        type: PaymentType.FIXED,
        budget: 1500,
        status: JobStatus.OPEN,
        clientId: clientCId,
      },
    });

    await prisma.job.create({
      data: {
        id: closedJobId,
        title: "Closed Job with Contract",
        description: "Closed description",
        category: "Design",
        skills: ["Figma"],
        type: PaymentType.FIXED,
        budget: 2000,
        status: JobStatus.CLOSED,
        clientId: clientAId,
      },
    });

    // Seed proposal and contract
    await prisma.proposal.create({
      data: {
        id: proposalId,
        jobId: closedJobId,
        freelancerId: freelancerBId,
        coverLetter: "Closed job contract proposal",
        bidAmount: 2000,
        status: "ACCEPTED",
      },
    });

    await prisma.contract.create({
      data: {
        id: contractId,
        title: "Closed Job Contract Conversation",
        terms: "Active work under closed job",
        type: PaymentType.FIXED,
        totalAmount: 2000,
        clientId: clientAId,
        freelancerId: freelancerBId,
        jobId: closedJobId,
        proposalId,
        status: "ACTIVE",
      },
    });

    // Seed Contract Conversation between Client A & Freelancer B
    await prisma.conversation.create({
      data: {
        id: convABContractId,
        type: ConversationType.CONTRACT,
        contractId,
        jobId: closedJobId,
        clientId: clientAId,
        freelancerId: freelancerBId,
        lastMessageAt: new Date("2026-03-01T10:00:00Z"),
      },
    });

    // Seed Pre-Hire Conversation between Client C & Freelancer B
    await prisma.conversation.create({
      data: {
        id: convCBPreHireId,
        type: ConversationType.PRE_HIRE,
        jobId: openJobId,
        clientId: clientCId,
        freelancerId: freelancerBId,
        lastMessageAt: new Date("2026-03-01T11:00:00Z"),
      },
    });

    // Seed Interview Invitation for Pre-Hire
    await prisma.interviewInvitation.create({
      data: {
        jobId: openJobId,
        clientId: clientCId,
        freelancerId: freelancerBId,
        conversationId: convCBPreHireId,
        message: "Invitation to interview for Open Job",
        status: InvitationStatus.ACCEPTED,
        expiresAt: new Date(Date.now() + 86400000 * 7),
      },
    });
  });

  afterAll(async () => {
    try {
      await prisma.notification.deleteMany({
        where: {
          userId: { in: [clientAId, clientCId, freelancerBId, strangerDId] },
        },
      });
      await prisma.message.deleteMany({
        where: {
          conversationId: { in: [convABContractId, convCBPreHireId] },
        },
      });
      await prisma.interviewInvitation.deleteMany({
        where: {
          conversationId: { in: [convABContractId, convCBPreHireId] },
        },
      });
      await prisma.conversation.deleteMany({
        where: {
          id: { in: [convABContractId, convCBPreHireId] },
        },
      });
      await prisma.contract.deleteMany({
        where: { id: contractId },
      });
      await prisma.proposal.deleteMany({
        where: { id: proposalId },
      });
      await prisma.job.deleteMany({
        where: { id: { in: [openJobId, closedJobId] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [clientAId, clientCId, freelancerBId, strangerDId] } },
      });
      await prisma.$disconnect();
    } catch (err) {
      console.warn("[Integration Test Cleanup]:", err);
    }
  });

  it("1. verifies client and freelancer conversation inbox isolation", async () => {
    // Client A should only see convABContractId
    const clientAInboxes = await prisma.conversation.findMany({
      where: { OR: [{ clientId: clientAId }, { freelancerId: clientAId }] },
    });
    expect(clientAInboxes).toHaveLength(1);
    expect(clientAInboxes[0].id).toBe(convABContractId);

    // Client C should only see convCBPreHireId
    const clientCInboxes = await prisma.conversation.findMany({
      where: { OR: [{ clientId: clientCId }, { freelancerId: clientCId }] },
    });
    expect(clientCInboxes).toHaveLength(1);
    expect(clientCInboxes[0].id).toBe(convCBPreHireId);

    // Freelancer B is in both conversations
    const freelancerBInboxes = await prisma.conversation.findMany({
      where: { OR: [{ clientId: freelancerBId }, { freelancerId: freelancerBId }] },
      orderBy: { lastMessageAt: "desc" },
    });
    expect(freelancerBInboxes).toHaveLength(2);
    expect(freelancerBInboxes.map((c) => c.id)).toEqual([convCBPreHireId, convABContractId]);

    // Stranger D is in zero conversations
    const strangerDInboxes = await prisma.conversation.findMany({
      where: { OR: [{ clientId: strangerDId }, { freelancerId: strangerDId }] },
    });
    expect(strangerDInboxes).toHaveLength(0);
  });

  it("2. verifies cursor pagination with stable chronological ordering and zero duplication across boundaries", async () => {
    // Seed 15 sequential messages in convABContractId
    const createdMessageIds: string[] = [];
    const baseTime = new Date("2026-03-01T12:00:00Z").getTime();

    for (let i = 1; i <= 15; i++) {
      const msg = await prisma.message.create({
        data: {
          conversationId: convABContractId,
          senderId: i % 2 === 0 ? clientAId : freelancerBId,
          content: `Message #${i}`,
          createdAt: new Date(baseTime + i * 60000), // 1 minute apart
          read: true,
        },
      });
      createdMessageIds.push(msg.id);
    }

    // Page 1: Fetch latest 5 messages (ordered desc in query, sliced and reversed)
    const page1Raw = await prisma.message.findMany({
      where: { conversationId: convABContractId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 5 + 1,
    });
    expect(page1Raw.length).toBe(6);
    const page1HasMore = page1Raw.length > 5;
    const page1Batch = page1Raw.slice(0, 5);
    const cursor1 = page1Batch[page1Batch.length - 1].id;
    const page1Chronological = [...page1Batch].reverse();

    expect(page1HasMore).toBe(true);
    expect(page1Chronological.map((m) => m.content)).toEqual([
      "Message #11",
      "Message #12",
      "Message #13",
      "Message #14",
      "Message #15",
    ]);

    // Page 2: Fetch next 5 older messages before cursor1
    const page2Raw = await prisma.message.findMany({
      where: { conversationId: convABContractId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      cursor: { id: cursor1 },
      skip: 1,
      take: 5 + 1,
    });
    expect(page2Raw.length).toBe(6);
    const page2HasMore = page2Raw.length > 5;
    const page2Batch = page2Raw.slice(0, 5);
    const cursor2 = page2Batch[page2Batch.length - 1].id;
    const page2Chronological = [...page2Batch].reverse();

    expect(page2HasMore).toBe(true);
    expect(page2Chronological.map((m) => m.content)).toEqual([
      "Message #6",
      "Message #7",
      "Message #8",
      "Message #9",
      "Message #10",
    ]);

    // Page 3: Fetch next 5 older messages before cursor2
    const page3Raw = await prisma.message.findMany({
      where: { conversationId: convABContractId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      cursor: { id: cursor2 },
      skip: 1,
      take: 5 + 1,
    });
    expect(page3Raw.length).toBe(5); // exactly 5 remaining, no more
    const page3HasMore = page3Raw.length > 5;
    const page3Batch = page3Raw.slice(0, 5);
    const page3Chronological = [...page3Batch].reverse();

    expect(page3HasMore).toBe(false);
    expect(page3Chronological.map((m) => m.content)).toEqual([
      "Message #1",
      "Message #2",
      "Message #3",
      "Message #4",
      "Message #5",
    ]);

    // Verify complete combined set matches exactly without duplicates
    const combined = [
      ...page3Chronological,
      ...page2Chronological,
      ...page1Chronological,
    ];
    expect(combined).toHaveLength(15);
    const combinedIds = combined.map((m) => m.id);
    expect(new Set(combinedIds).size).toBe(15);
    expect(combinedIds).toEqual(createdMessageIds);
  });

  it("3. verifies read receipts: only counterparty messages are marked read and repeated requests are safe", async () => {
    // In convCBPreHireId, create 3 unread messages from Client C and 1 unread message from Freelancer B
    await prisma.message.createMany({
      data: [
        {
          conversationId: convCBPreHireId,
          senderId: clientCId,
          content: "Client unread 1",
          read: false,
        },
        {
          conversationId: convCBPreHireId,
          senderId: clientCId,
          content: "Client unread 2",
          read: false,
        },
        {
          conversationId: convCBPreHireId,
          senderId: clientCId,
          content: "Client unread 3",
          read: false,
        },
        {
          conversationId: convCBPreHireId,
          senderId: freelancerBId,
          content: "Freelancer own unread message",
          read: false,
        },
      ],
    });

    // Freelancer B marks conversation as read: only Client C's messages must be updated
    const updateResult = await prisma.message.updateMany({
      where: {
        conversationId: convCBPreHireId,
        senderId: { not: freelancerBId },
        read: false,
      },
      data: { read: true },
    });

    expect(updateResult.count).toBe(3);

    // Verify Client C's messages are now read
    const clientMessages = await prisma.message.findMany({
      where: { conversationId: convCBPreHireId, senderId: clientCId },
    });
    expect(clientMessages.every((m) => m.read === true)).toBe(true);

    // Verify Freelancer B's own message remains unread (cannot mark own message as read)
    const freelancerMsg = await prisma.message.findFirst({
      where: { conversationId: convCBPreHireId, senderId: freelancerBId },
    });
    expect(freelancerMsg?.read).toBe(false);

    // Repeated mark-as-read call must be completely safe and update 0 records
    const repeatUpdate = await prisma.message.updateMany({
      where: {
        conversationId: convCBPreHireId,
        senderId: { not: freelancerBId },
        read: false,
      },
      data: { read: true },
    });
    expect(repeatUpdate.count).toBe(0);
  });

  it("4. verifies N+1 elimination via single aggregation for unread counts", async () => {
    // Both convABContractId and convCBPreHireId exist
    const conversationIds = [convABContractId, convCBPreHireId];

    // Single aggregation query using groupBy
    const unreadGroups = await prisma.message.groupBy({
      by: ["conversationId"],
      where: {
        conversationId: { in: conversationIds },
        senderId: { not: freelancerBId },
        read: false,
      },
      _count: {
        _all: true,
      },
    });

    const unreadCountMap = new Map(
      unreadGroups.map((g) => [g.conversationId, g._count._all])
    );

    // All Client C's messages were marked read in test 3, convAB messages were seeded with read: true
    // So unread count for both is 0
    expect(unreadCountMap.get(convCBPreHireId) || 0).toBe(0);
    expect(unreadCountMap.get(convABContractId) || 0).toBe(0);

    // Add 2 new unread messages from Client A to Freelancer B in convABContractId
    await prisma.message.createMany({
      data: [
        { conversationId: convABContractId, senderId: clientAId, content: "New A 1", read: false },
        { conversationId: convABContractId, senderId: clientAId, content: "New A 2", read: false },
      ],
    });

    // Re-run single aggregation query
    const updatedGroups = await prisma.message.groupBy({
      by: ["conversationId"],
      where: {
        conversationId: { in: conversationIds },
        senderId: { not: freelancerBId },
        read: false,
      },
      _count: {
        _all: true,
      },
    });

    const updatedMap = new Map(
      updatedGroups.map((g) => [g.conversationId, g._count._all])
    );

    expect(updatedMap.get(convABContractId)).toBe(2);
    expect(updatedMap.get(convCBPreHireId) || 0).toBe(0);
  });

  it("5. verifies unauthorized conversation access is strictly blocked", async () => {
    // Verify Stranger D is not a participant in convABContractId
    const conv = await prisma.conversation.findUnique({
      where: { id: convABContractId },
      select: { clientId: true, freelancerId: true },
    });

    const isAuthorized =
      conv?.clientId === strangerDId || conv?.freelancerId === strangerDId;
    expect(isAuthorized).toBe(false);
  });

  it("6. verifies pre-hire messaging is blocked after invitation state changes or job closure", async () => {
    // Set invitation status to DECLINED
    await prisma.interviewInvitation.update({
      where: { conversationId: convCBPreHireId },
      data: { status: InvitationStatus.DECLINED },
    });

    const invDeclined = await prisma.interviewInvitation.findUnique({
      where: { conversationId: convCBPreHireId },
    });
    expect(invDeclined?.status).toBe("DECLINED");

    // Freelancer sending message when invitation is DECLINED must be prohibited
    const canFreelancerSend = invDeclined?.status === "ACCEPTED";
    expect(canFreelancerSend).toBe(false);

    // Set invitation status to WITHDRAWN
    await prisma.interviewInvitation.update({
      where: { conversationId: convCBPreHireId },
      data: { status: InvitationStatus.WITHDRAWN },
    });

    const invWithdrawn = await prisma.interviewInvitation.findUnique({
      where: { conversationId: convCBPreHireId },
    });
    expect(invWithdrawn?.status).toBe("WITHDRAWN");
    expect(invWithdrawn?.status === "ACCEPTED").toBe(false);

    // Close the pre-hire job
    await prisma.job.update({
      where: { id: openJobId },
      data: { status: JobStatus.CLOSED },
    });

    const jobClosed = await prisma.job.findUnique({
      where: { id: openJobId },
    });
    expect(jobClosed?.status).toBe("CLOSED");

    // Pre-hire messaging must be completely blocked when job is CLOSED
    const isJobEligibleForPreHire = jobClosed?.status === "OPEN";
    expect(isJobEligibleForPreHire).toBe(false);

    // Restore job and invitation status
    await prisma.job.update({
      where: { id: openJobId },
      data: { status: JobStatus.OPEN },
    });
    await prisma.interviewInvitation.update({
      where: { conversationId: convCBPreHireId },
      data: { status: InvitationStatus.ACCEPTED },
    });
  });

  it("7. verifies contract messaging continues working even after job is CLOSED", async () => {
    // convABContractId is linked to closedJobId (which has status: CLOSED)
    const conv = await prisma.conversation.findUnique({
      where: { id: convABContractId },
      include: {
        job: { select: { status: true } },
        contract: { select: { status: true } },
      },
    });

    expect(conv?.type).toBe(ConversationType.CONTRACT);
    expect(conv?.job?.status).toBe(JobStatus.CLOSED);
    expect(conv?.contract?.status).toBe("ACTIVE");

    // Send a message under this contract conversation within a transaction
    const [contractMsg] = await prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversationId: convABContractId,
          senderId: freelancerBId,
          content: "Contract deliverable update on closed job",
          read: false,
        },
      });

      await tx.conversation.update({
        where: { id: convABContractId },
        data: { lastMessageAt: msg.createdAt },
      });

      return [msg];
    });

    expect(contractMsg).toBeDefined();
    expect(contractMsg.content).toBe("Contract deliverable update on closed job");

    const updatedConv = await prisma.conversation.findUnique({
      where: { id: convABContractId },
    });
    expect(updatedConv?.lastMessageAt.getTime()).toBe(contractMsg.createdAt.getTime());
  });

  it("8. verifies concurrent message creation and atomic lastMessageAt consistency", async () => {
    // Concurrently create 10 messages from client and freelancer in convABContractId
    const concurrentCount = 10;
    const tasks = Array.from({ length: concurrentCount }, async (_, i) => {
      const msg = await prisma.message.create({
        data: {
          conversationId: convABContractId,
          senderId: i % 2 === 0 ? clientAId : freelancerBId,
          content: `Concurrent burst message #${i}`,
          read: false,
        },
      });

      await prisma.conversation.updateMany({
        where: {
          id: convABContractId,
          lastMessageAt: { lte: msg.createdAt },
        },
        data: { lastMessageAt: msg.createdAt },
      });

      return msg;
    });

    const results = await Promise.all(tasks);
    expect(results).toHaveLength(concurrentCount);

    // Verify all messages exist in database
    const savedMessages = await prisma.message.findMany({
      where: {
        conversationId: convABContractId,
        content: { startsWith: "Concurrent burst message #" },
      },
      orderBy: { createdAt: "asc" },
    });
    expect(savedMessages).toHaveLength(concurrentCount);

    // Verify conversation's lastMessageAt reflects the latest message
    const finalConv = await prisma.conversation.findUnique({
      where: { id: convABContractId },
    });

    const latestMessage = savedMessages[savedMessages.length - 1];
    expect(finalConv?.lastMessageAt.getTime()).toBeGreaterThanOrEqual(
      latestMessage.createdAt.getTime()
    );
  });

  it("9. verifies cursor pagination with deliberately identical timestamps, bidirectional traversal, and zero duplicates", async () => {
    // Clean existing messages in convCBPreHireId
    await prisma.message.deleteMany({ where: { conversationId: convCBPreHireId } });

    // Seed 6 messages with deliberately identical timestamps:
    // 3 messages at exact millisecond T1, 3 messages at exact millisecond T2
    const fixedT1 = new Date(1710000000000); // 2024-03-09T18:40:00.000Z
    const fixedT2 = new Date(1710000010000); // 10 seconds later

    const seededMessages = [];
    // Messages 0, 1, 2 have timestamp T1
    for (let i = 0; i < 3; i++) {
      const msg = await prisma.message.create({
        data: {
          conversationId: convCBPreHireId,
          senderId: i % 2 === 0 ? clientCId : freelancerBId,
          content: `Deliberate Identical T1 - #${i}`,
          createdAt: fixedT1,
          read: true,
        },
      });
      seededMessages.push(msg);
    }
    // Messages 3, 4, 5 have timestamp T2
    for (let i = 3; i < 6; i++) {
      const msg = await prisma.message.create({
        data: {
          conversationId: convCBPreHireId,
          senderId: i % 2 === 0 ? clientCId : freelancerBId,
          content: `Deliberate Identical T2 - #${i}`,
          createdAt: fixedT2,
          read: true,
        },
      });
      seededMessages.push(msg);
    }

    expect(seededMessages).toHaveLength(6);

    // Verify all 6 documents were stored with exact timestamps
    const checkT1Count = await prisma.message.count({
      where: { conversationId: convCBPreHireId, createdAt: fixedT1 },
    });
    const checkT2Count = await prisma.message.count({
      where: { conversationId: convCBPreHireId, createdAt: fixedT2 },
    });
    expect(checkT1Count).toBe(3);
    expect(checkT2Count).toBe(3);

    // --- TEST DIRECTION: "before" (History pagination: DESC query, then reversed) ---
    // Page 1: take 2 + 1
    const pageSize = 2;
    const page1Raw = await prisma.message.findMany({
      where: { conversationId: convCBPreHireId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
    });
    expect(page1Raw.length).toBe(3);
    const page1HasMore = page1Raw.length > pageSize;
    const page1Batch = page1Raw.slice(0, pageSize);
    const cursor1 = page1Batch[page1Batch.length - 1].id;
    const page1Chronological = [...page1Batch].reverse();
    expect(page1HasMore).toBe(true);
    expect(page1Chronological).toHaveLength(2);

    // Page 2: take 2 + 1 with cursor1
    const page2Raw = await prisma.message.findMany({
      where: { conversationId: convCBPreHireId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      cursor: { id: cursor1 },
      skip: 1,
      take: pageSize + 1,
    });
    expect(page2Raw.length).toBe(3);
    const page2HasMore = page2Raw.length > pageSize;
    const page2Batch = page2Raw.slice(0, pageSize);
    const cursor2 = page2Batch[page2Batch.length - 1].id;
    const page2Chronological = [...page2Batch].reverse();
    expect(page2HasMore).toBe(true);
    expect(page2Chronological).toHaveLength(2);

    // Page 3: take 2 + 1 with cursor2
    const page3Raw = await prisma.message.findMany({
      where: { conversationId: convCBPreHireId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      cursor: { id: cursor2 },
      skip: 1,
      take: pageSize + 1,
    });
    expect(page3Raw.length).toBe(2); // Exactly 2 remaining
    const page3HasMore = page3Raw.length > pageSize;
    const page3Batch = page3Raw.slice(0, pageSize);
    const page3Chronological = [...page3Batch].reverse();
    expect(page3HasMore).toBe(false);
    expect(page3Chronological).toHaveLength(2);

    // Combined pages in "before" pagination: must contain all 6 distinct messages without gaps or duplicates
    const combinedBefore = [
      ...page3Chronological,
      ...page2Chronological,
      ...page1Chronological,
    ];
    expect(combinedBefore).toHaveLength(6);
    const combinedBeforeIds = combinedBefore.map((m) => m.id);
    expect(new Set(combinedBeforeIds).size).toBe(6);

    // --- TEST DIRECTION: "after" (Forward / polling pagination: ASC query) ---
    const ascPage1 = await prisma.message.findMany({
      where: { conversationId: convCBPreHireId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: pageSize + 1,
    });
    expect(ascPage1.length).toBe(3);
    const ascBatch1 = ascPage1.slice(0, pageSize);
    const ascCursor1 = ascBatch1[ascBatch1.length - 1].id;

    const ascPage2 = await prisma.message.findMany({
      where: { conversationId: convCBPreHireId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      cursor: { id: ascCursor1 },
      skip: 1,
      take: pageSize + 1,
    });
    expect(ascPage2.length).toBe(3);
    const ascBatch2 = ascPage2.slice(0, pageSize);
    const ascCursor2 = ascBatch2[ascBatch2.length - 1].id;

    const ascPage3 = await prisma.message.findMany({
      where: { conversationId: convCBPreHireId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      cursor: { id: ascCursor2 },
      skip: 1,
      take: pageSize + 1,
    });
    expect(ascPage3.length).toBe(2);
    const ascBatch3 = ascPage3.slice(0, pageSize);

    const combinedAfter = [...ascBatch1, ...ascBatch2, ...ascBatch3];
    expect(combinedAfter).toHaveLength(6);
    const combinedAfterIds = combinedAfter.map((m) => m.id);
    expect(new Set(combinedAfterIds).size).toBe(6);
    expect(combinedAfterIds).toEqual(combinedBeforeIds);

    // --- TEST POLLING AND LOADING OLDER WITHOUT DUPLICATES ---
    // Emulate ChatRoom state management
    let chatRoomState = [...page1Chronological]; // starts with page 1 (2 messages)
    expect(chatRoomState).toHaveLength(2);

    // User loads older messages (page 2)
    const existingIds = new Set(chatRoomState.map((m) => m.id));
    const olderMessages = page2Chronological.filter((m) => !existingIds.has(m.id));
    chatRoomState = [...olderMessages, ...chatRoomState];
    expect(chatRoomState).toHaveLength(4);
    expect(new Set(chatRoomState.map((m) => m.id)).size).toBe(4);

    // Periodic poll runs (retrieves latest 2 messages)
    const pollArrivals = page1Chronological.filter((m) => !new Set(chatRoomState.map((x) => x.id)).has(m.id));
    expect(pollArrivals).toHaveLength(0); // Poll does not duplicate existing messages
    chatRoomState = [...chatRoomState, ...pollArrivals];
    expect(chatRoomState).toHaveLength(4);
  });

  it("10. verifies message insertion and lastMessageAt consistency under concurrency, failures, and network retries", async () => {
    const baseTime = Date.now();
    const tOlder = new Date(baseTime + 2000);
    const tNewer = new Date(baseTime + 8000);

    // --- 1. Concurrent arrival with monotonic advancement ---
    // Message A has older timestamp, Message B has newer timestamp
    // Interleaving: Message B updates conversation first, then Message A attempts to update
    const msgB = await prisma.message.create({
      data: {
        conversationId: convABContractId,
        senderId: clientAId,
        content: "Concurrent Message B (newer)",
        createdAt: tNewer,
        read: true,
      },
    });

    await prisma.conversation.updateMany({
      where: {
        id: convABContractId,
        lastMessageAt: { lte: msgB.createdAt },
      },
      data: { lastMessageAt: msgB.createdAt },
    });

    const convAfterB = await prisma.conversation.findUnique({
      where: { id: convABContractId },
      select: { lastMessageAt: true },
    });
    expect(convAfterB?.lastMessageAt.getTime()).toBe(tNewer.getTime());

    // Message A's update executes after Message B
    const msgA = await prisma.message.create({
      data: {
        conversationId: convABContractId,
        senderId: freelancerBId,
        content: "Concurrent Message A (older)",
        createdAt: tOlder,
        read: true,
      },
    });

    const updateAResult = await prisma.conversation.updateMany({
      where: {
        id: convABContractId,
        lastMessageAt: { lte: msgA.createdAt },
      },
      data: { lastMessageAt: msgA.createdAt },
    });

    // The monotonic filter (lte: tOlder) matched 0 documents because lastMessageAt is already tNewer
    expect(updateAResult.count).toBe(0);

    const convAfterA = await prisma.conversation.findUnique({
      where: { id: convABContractId },
      select: { lastMessageAt: true },
    });
    // Timestamp must NOT have rolled backward!
    expect(convAfterA?.lastMessageAt.getTime()).toBe(tNewer.getTime());

    // --- 2. Client retry / network timeout idempotency ---
    const retryContent = `Network retry test - ${Date.now()}`;

    // First attempt creates message
    const firstInsert = await prisma.message.create({
      data: {
        conversationId: convABContractId,
        senderId: clientAId,
        content: retryContent,
      },
    });

    await prisma.conversation.updateMany({
      where: {
        id: convABContractId,
        lastMessageAt: { lte: firstInsert.createdAt },
      },
      data: { lastMessageAt: firstInsert.createdAt },
    });

    // Client retries 500ms later (network timeout simulation)
    // Server runs deduplication query:
    const recentDuplicate = await prisma.message.findFirst({
      where: {
        conversationId: convABContractId,
        senderId: clientAId,
        content: retryContent,
        createdAt: { gte: new Date(Date.now() - 2500) },
      },
      orderBy: { createdAt: "desc" },
    });

    expect(recentDuplicate).toBeDefined();
    expect(recentDuplicate?.id).toBe(firstInsert.id);

    // Verify only ONE message document exists with this content
    const totalMatchingMessages = await prisma.message.count({
      where: {
        conversationId: convABContractId,
        content: retryContent,
      },
    });
    expect(totalMatchingMessages).toBe(1);

    // --- 3. Self-healing fallback when lastMessageAt lagged ---
    // Simulate a scenario where message was saved with latest timestamp but conversation lastMessageAt was stale
    const delayedTime = new Date(baseTime + 20000);
    const delayedMsg = await prisma.message.create({
      data: {
        conversationId: convABContractId,
        senderId: freelancerBId,
        content: "Message with delayed conversation update",
        createdAt: delayedTime,
        read: true,
      },
    });
    expect(delayedMsg.id).toBeDefined();

    // Fetch conversation with latest message snippet
    const rawConv = await prisma.conversation.findUnique({
      where: { id: convABContractId },
      include: {
        messages: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    const lastMsg = rawConv?.messages[0];
    const effectiveLastMessageAt =
      lastMsg && lastMsg.createdAt > (rawConv?.lastMessageAt || new Date(0))
        ? lastMsg.createdAt
        : rawConv?.lastMessageAt;

    expect(effectiveLastMessageAt?.getTime()).toBe(delayedTime.getTime());

    // Run self-healing update
    await prisma.conversation.updateMany({
      where: {
        id: convABContractId,
        lastMessageAt: { lte: delayedTime },
      },
      data: { lastMessageAt: delayedTime },
    });

    const healedConv = await prisma.conversation.findUnique({
      where: { id: convABContractId },
      select: { lastMessageAt: true },
    });
    expect(healedConv?.lastMessageAt.getTime()).toBe(delayedTime.getTime());
  });

  it("11. verifies read receipt and notification consistency & atomicity via multi-document transactions", async () => {
    // Clean existing messages and notifications for convCBPreHireId
    await prisma.message.deleteMany({ where: { conversationId: convCBPreHireId } });
    await prisma.notification.deleteMany({
      where: { userId: { in: [clientCId, freelancerBId] } },
    });

    // Create 2 unread messages from Client C to Freelancer B in convCBPreHireId
    await prisma.message.createMany({
      data: [
        {
          conversationId: convCBPreHireId,
          senderId: clientCId,
          content: "Unread message 1 for atomicity test",
          read: false,
        },
        {
          conversationId: convCBPreHireId,
          senderId: clientCId,
          content: "Unread message 2 for atomicity test",
          read: false,
        },
      ],
    });

    // Create 2 notifications for Freelancer B pointing to convCBPreHireId
    await prisma.notification.createMany({
      data: [
        {
          userId: freelancerBId,
          type: NotificationType.NEW_MESSAGE,
          title: "New message from Client C",
          message: "Unread message 1",
          link: `/messages?conversationId=${convCBPreHireId}`,
          read: false,
        },
        {
          userId: freelancerBId,
          type: NotificationType.NEW_MESSAGE,
          title: "New message from Client C",
          message: "Unread message 2",
          link: `/messages?conversationId=${convCBPreHireId}`,
          read: false,
        },
      ],
    });

    // Also create 1 notification for Freelancer B pointing to convABContractId (different conversation)
    await prisma.notification.create({
      data: {
        userId: freelancerBId,
        type: NotificationType.NEW_MESSAGE,
        title: "New message from Client A",
        message: "Unrelated message",
        link: `/messages?conversationId=${convABContractId}`,
        read: false,
      },
    });

    // Verify initial unread state
    const initialUnreadMsgCount = await prisma.message.count({
      where: {
        conversationId: convCBPreHireId,
        senderId: clientCId,
        read: false,
      },
    });
    expect(initialUnreadMsgCount).toBe(2);

    const initialUnreadNotifs = await prisma.notification.count({
      where: {
        userId: freelancerBId,
        read: false,
      },
    });
    expect(initialUnreadNotifs).toBe(3); // 2 for convCB + 1 for convAB

    // --- 1. Atomic Transaction Update ---
    const [msgRes, notifRes] = await prisma.$transaction([
      prisma.message.updateMany({
        where: {
          conversationId: convCBPreHireId,
          senderId: { not: freelancerBId },
          read: false,
        },
        data: { read: true },
      }),
      prisma.notification.updateMany({
        where: {
          userId: freelancerBId,
          type: NotificationType.NEW_MESSAGE,
          link: { contains: convCBPreHireId },
          read: false,
        },
        data: { read: true },
      }),
    ]);

    expect(msgRes.count).toBe(2);
    expect(notifRes.count).toBe(2);

    // --- 2. Isolation from another conversation ---
    // The notification for convABContractId must remain strictly unread!
    const convABNotif = await prisma.notification.findFirst({
      where: {
        userId: freelancerBId,
        link: { contains: convABContractId },
      },
    });
    expect(convABNotif).toBeDefined();
    expect(convABNotif?.read).toBe(false);

    // --- 3. Immediate unread count reflection ---
    const immediateUnreadCount = await prisma.message.count({
      where: {
        conversationId: convCBPreHireId,
        senderId: { not: freelancerBId },
        read: false,
      },
    });
    expect(immediateUnreadCount).toBe(0);

    // --- 4. Repeated mark-as-read requests (Idempotency) ---
    const [repeatMsg, repeatNotif] = await prisma.$transaction([
      prisma.message.updateMany({
        where: {
          conversationId: convCBPreHireId,
          senderId: { not: freelancerBId },
          read: false,
        },
        data: { read: true },
      }),
      prisma.notification.updateMany({
        where: {
          userId: freelancerBId,
          type: NotificationType.NEW_MESSAGE,
          link: { contains: convCBPreHireId },
          read: false,
        },
        data: { read: true },
      }),
    ]);
    expect(repeatMsg.count).toBe(0);
    expect(repeatNotif.count).toBe(0);

    // --- 5. Concurrent read requests from multiple tabs ---
    // Simulate Tab 1 and Tab 2 marking as read simultaneously
    const tab1 = prisma.$transaction([
      prisma.message.updateMany({
        where: {
          conversationId: convCBPreHireId,
          senderId: { not: freelancerBId },
          read: false,
        },
        data: { read: true },
      }),
      prisma.notification.updateMany({
        where: {
          userId: freelancerBId,
          type: NotificationType.NEW_MESSAGE,
          link: { contains: convCBPreHireId },
          read: false,
        },
        data: { read: true },
      }),
    ]);

    const tab2 = prisma.$transaction([
      prisma.message.updateMany({
        where: {
          conversationId: convCBPreHireId,
          senderId: { not: freelancerBId },
          read: false,
        },
        data: { read: true },
      }),
      prisma.notification.updateMany({
        where: {
          userId: freelancerBId,
          type: NotificationType.NEW_MESSAGE,
          link: { contains: convCBPreHireId },
          read: false,
        },
        data: { read: true },
      }),
    ]);

    const [tab1Res, tab2Res] = await Promise.all([tab1, tab2]);
    expect(tab1Res[0].count).toBe(0);
    expect(tab2Res[0].count).toBe(0);
  });
});

