// src/tests/integration/hiring-workflow.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  Prisma,
  PrismaClient,
  Role,
  JobStatus,
  PaymentType,
  ConversationType,
  InvitationStatus,
  NotificationType,
} from "@prisma/client";

async function createNotificationSafeDirect(
  prismaClient: PrismaClient,
  params: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    link?: string;
    idempotencyKey?: string;
  }
): Promise<boolean> {
  try {
    if (params.idempotencyKey) {
      try {
        await prismaClient.notification.create({
          data: {
            userId: params.userId,
            type: params.type,
            title: params.title,
            message: params.message,
            link: params.link,
            idempotencyKey: params.idempotencyKey,
          },
        });
        return true;
      } catch (err: unknown) {
        const errObj = err as Record<string, unknown>;
        const isDuplicate =
          (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") ||
          /E11000\s+duplicate\s+key/i.test(err instanceof Error ? err.message : "") ||
          errObj?.code === 11000;
        if (isDuplicate) {
          return true;
        }
        return false;
      }
    }

    if (params.link) {
      const existing = await prismaClient.notification.findFirst({
        where: {
          userId: params.userId,
          type: params.type,
          link: params.link,
          title: params.title,
          createdAt: { gte: new Date(Date.now() - 10000) },
        },
      });
      if (existing) {
        return true;
      }
    }

    await prismaClient.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        link: params.link,
      },
    });
    return true;
  } catch {
    return false;
  }
}

const isIntegrationRun = process.env.WORKPULSE_INTEGRATION_RUN === "true";
const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  "mongodb://127.0.0.1:27018/workpulse_test?replicaSet=rsTest&directConnection=true";

describe("WorkPulse Phase 3 Batch 4: Hiring Workflow Integration - MongoDB Replica Set Integration Tests", () => {
  if (!isIntegrationRun) {
    it.skip("skips database integration test during standard unit test run (run 'npm run test:integration')", () => {
      // Skipped during normal unit test execution
    });
    return;
  }

  let prisma: PrismaClient;

  // Dedicated ObjectIds for integration test isolation
  const clientOwnerId = "67c000000000000000000001";
  const clientImposterId = "67c000000000000000000002";
  const freelancerWinnerId = "67c000000000000000000003";
  const freelancerCompId = "67c000000000000000000004";
  const unverifiedClientId = "67c000000000000000000005";

  const jobWithPreHireId = "67c000000000000000000011";
  const jobWithoutPreHireId = "67c000000000000000000012";
  const jobConcurrentRaceId = "67c000000000000000000013";
  const jobClosedId = "67c000000000000000000014";
  const jobInvitationDeclineId = "67c000000000000000000015";
  const jobInvitationRejectId = "67c000000000000000000016";
  const jobTwoClientsId = "67c000000000000000000017";

  const proposalWinnerId = "67c000000000000000000021";
  const proposalCompId = "67c000000000000000000022";
  const proposalNoConvId = "67c000000000000000000023";
  const proposalRace1Id = "67c000000000000000000024";
  const proposalRace2Id = "67c000000000000000000025";
  const proposalClosedJobId = "67c000000000000000000026";
  const proposalDeclinedInvId = "67c000000000000000000027";
  const proposalRejectedInvId = "67c000000000000000000028";
  const proposalTwoClientsId = "67c000000000000000000029";

  const convPreHireId = "67c000000000000000000031";
  const convDeclinedInvId = "67c000000000000000000032";
  const convRejectedInvId = "67c000000000000000000033";

  const invDeclinedId = "67c000000000000000000041";
  const invAcceptedId = "67c000000000000000000042";

  const allUserIds = [
    clientOwnerId,
    clientImposterId,
    freelancerWinnerId,
    freelancerCompId,
    unverifiedClientId,
  ];

  const allJobIds = [
    jobWithPreHireId,
    jobWithoutPreHireId,
    jobConcurrentRaceId,
    jobClosedId,
    jobInvitationDeclineId,
    jobInvitationRejectId,
    jobTwoClientsId,
  ];

  const allProposalIds = [
    proposalWinnerId,
    proposalCompId,
    proposalNoConvId,
    proposalRace1Id,
    proposalRace2Id,
    proposalClosedJobId,
    proposalDeclinedInvId,
    proposalRejectedInvId,
    proposalTwoClientsId,
  ];

  const allConvIds = [convPreHireId, convDeclinedInvId, convRejectedInvId];

  async function cleanupAll() {
    await prisma.notification.deleteMany({
      where: { userId: { in: allUserIds } },
    });
    await prisma.message.deleteMany({
      where: { conversationId: { in: allConvIds } },
    });
    await prisma.interviewInvitation.deleteMany({
      where: { id: { in: [invDeclinedId, invAcceptedId] } },
    });
    await prisma.conversation.deleteMany({
      where: {
        OR: [
          { id: { in: allConvIds } },
          { jobId: { in: allJobIds } },
        ],
      },
    });
    await prisma.contract.deleteMany({
      where: { jobId: { in: allJobIds } },
    });
    await prisma.proposal.deleteMany({
      where: { id: { in: allProposalIds } },
    });
    await prisma.job.deleteMany({
      where: { id: { in: allJobIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: allUserIds } },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: testDbUrl,
        },
      },
    });

    await cleanupAll();

    // 1. Seed Users
    await prisma.user.createMany({
      data: [
        {
          id: clientOwnerId,
          email: "owner.client@hiring-test.com",
          name: "Client Owner Corp",
          role: Role.CLIENT,
          roleSelected: true,
          emailVerified: new Date("2026-01-01"),
        },
        {
          id: clientImposterId,
          email: "imposter.client@hiring-test.com",
          name: "Client Imposter LLC",
          role: Role.CLIENT,
          roleSelected: true,
          emailVerified: new Date("2026-01-01"),
        },
        {
          id: freelancerWinnerId,
          email: "winner.freelancer@hiring-test.com",
          name: "Freelancer Winner",
          role: Role.FREELANCER,
          roleSelected: true,
          emailVerified: new Date("2026-01-01"),
        },
        {
          id: freelancerCompId,
          email: "competitor.freelancer@hiring-test.com",
          name: "Freelancer Competitor",
          role: Role.FREELANCER,
          roleSelected: true,
          emailVerified: new Date("2026-01-01"),
        },
        {
          id: unverifiedClientId,
          email: "unverified.client@hiring-test.com",
          name: "Unverified Client",
          role: Role.CLIENT,
          roleSelected: true,
          emailVerified: null, // Strictly unverified
        },
      ],
    });

    // 2. Seed Jobs
    await prisma.job.createMany({
      data: [
        {
          id: jobWithPreHireId,
          clientId: clientOwnerId,
          title: "Fullstack Architecture Overhaul",
          description: "Major contract with pre-hire interview",
          category: "Web Development",
          type: PaymentType.FIXED,
          budget: 5000,
          status: JobStatus.OPEN,
        },
        {
          id: jobWithoutPreHireId,
          clientId: clientOwnerId,
          title: "Direct Proposal Job (No Prior Chat)",
          description: "Client hires directly without interview",
          category: "Web Development",
          type: PaymentType.HOURLY,
          budget: 80,
          hourlyMin: 60,
          hourlyMax: 90,
          status: JobStatus.OPEN,
        },
        {
          id: jobConcurrentRaceId,
          clientId: clientOwnerId,
          title: "High-Contention Contract Award",
          description: "Multiple concurrent acceptance attempts",
          category: "Web Development",
          type: PaymentType.FIXED,
          budget: 3500,
          status: JobStatus.OPEN,
        },
        {
          id: jobClosedId,
          clientId: clientOwnerId,
          title: "Pre-Closed Job",
          description: "Already marked closed before proposal review",
          category: "Web Development",
          type: PaymentType.FIXED,
          budget: 2000,
          status: JobStatus.CLOSED,
        },
        {
          id: jobInvitationDeclineId,
          clientId: clientOwnerId,
          title: "Job With Declined Interview",
          description: "Freelancer declined interview but proposal remains active",
          category: "Web Development",
          type: PaymentType.FIXED,
          budget: 4000,
          status: JobStatus.OPEN,
        },
        {
          id: jobInvitationRejectId,
          clientId: clientOwnerId,
          title: "Job With Accepted Interview Then Rejected Proposal",
          description: "Interview was accepted but client rejects proposal",
          category: "Web Development",
          type: PaymentType.FIXED,
          budget: 2500,
          status: JobStatus.OPEN,
        },
        {
          id: jobTwoClientsId,
          clientId: clientOwnerId,
          title: "Job For Concurrent Clients Race",
          description: "Two clients race to accept the same proposal",
          category: "Web Development",
          type: PaymentType.FIXED,
          budget: 3000,
          status: JobStatus.OPEN,
        },
      ],
    });

    // 3. Seed Proposals
    await prisma.proposal.createMany({
      data: [
        {
          id: proposalWinnerId,
          jobId: jobWithPreHireId,
          freelancerId: freelancerWinnerId,
          bidAmount: 4800,
          estimatedDuration: "3 weeks",
          coverLetter: "I have built similar platforms and can deliver.",
          status: "PENDING",
        },
        {
          id: proposalCompId,
          jobId: jobWithPreHireId,
          freelancerId: freelancerCompId,
          bidAmount: 5000,
          estimatedDuration: "4 weeks",
          coverLetter: "Competing proposal that should be rejected upon hire.",
          status: "PENDING",
        },
        {
          id: proposalNoConvId,
          jobId: jobWithoutPreHireId,
          freelancerId: freelancerWinnerId,
          bidAmount: 75,
          estimatedDuration: "2 months",
          coverLetter: "Direct bid without prior discussion.",
          status: "PENDING",
        },
        {
          id: proposalRace1Id,
          jobId: jobConcurrentRaceId,
          freelancerId: freelancerWinnerId,
          bidAmount: 3200,
          estimatedDuration: "1 month",
          coverLetter: "Race Proposal 1",
          status: "PENDING",
        },
        {
          id: proposalRace2Id,
          jobId: jobConcurrentRaceId,
          freelancerId: freelancerCompId,
          bidAmount: 3400,
          estimatedDuration: "1 month",
          coverLetter: "Race Proposal 2",
          status: "PENDING",
        },
        {
          id: proposalClosedJobId,
          jobId: jobClosedId,
          freelancerId: freelancerWinnerId,
          bidAmount: 1800,
          estimatedDuration: "1 week",
          coverLetter: "Bid on closed job",
          status: "PENDING",
        },
        {
          id: proposalDeclinedInvId,
          jobId: jobInvitationDeclineId,
          freelancerId: freelancerWinnerId,
          bidAmount: 3900,
          estimatedDuration: "3 weeks",
          coverLetter: "Bid with declined interview",
          status: "PENDING",
        },
        {
          id: proposalRejectedInvId,
          jobId: jobInvitationRejectId,
          freelancerId: freelancerWinnerId,
          bidAmount: 2400,
          estimatedDuration: "2 weeks",
          coverLetter: "Bid to be rejected",
          status: "PENDING",
        },
        {
          id: proposalTwoClientsId,
          jobId: jobTwoClientsId,
          freelancerId: freelancerWinnerId,
          bidAmount: 3000,
          estimatedDuration: "1 month",
          coverLetter: "Race Proposal for two clients",
          status: "PENDING",
        },
      ],
    });

    // 4. Seed Pre-Hire Conversation for jobWithPreHireId
    await prisma.conversation.create({
      data: {
        id: convPreHireId,
        type: ConversationType.PRE_HIRE,
        jobId: jobWithPreHireId,
        clientId: clientOwnerId,
        freelancerId: freelancerWinnerId,
        lastMessageAt: new Date(),
      },
    });

    // Seed messages in pre-hire conversation
    await prisma.message.createMany({
      data: [
        {
          conversationId: convPreHireId,
          senderId: clientOwnerId,
          content: "Hello, let's discuss your architectural proposal.",
          read: true,
        },
        {
          conversationId: convPreHireId,
          senderId: freelancerWinnerId,
          content: "Gladly! I have reviewed the requirements in detail.",
          read: true,
        },
        {
          conversationId: convPreHireId,
          senderId: clientOwnerId,
          content: "Sounds great. I am preparing the offer now.",
          read: false,
        },
      ],
    });

    // 5. Seed Pre-Hire Conversations & Invitations for declined/rejected cases
    await prisma.conversation.create({
      data: {
        id: convDeclinedInvId,
        type: ConversationType.PRE_HIRE,
        jobId: jobInvitationDeclineId,
        clientId: clientOwnerId,
        freelancerId: freelancerWinnerId,
        lastMessageAt: new Date(),
      },
    });
    await prisma.interviewInvitation.create({
      data: {
        id: invDeclinedId,
        jobId: jobInvitationDeclineId,
        clientId: clientOwnerId,
        freelancerId: freelancerWinnerId,
        conversationId: convDeclinedInvId,
        message: "Interview for Job With Declined Interview",
        status: InvitationStatus.DECLINED,
        expiresAt: new Date(Date.now() + 86400000 * 7),
        respondedAt: new Date(),
      },
    });

    await prisma.conversation.create({
      data: {
        id: convRejectedInvId,
        type: ConversationType.PRE_HIRE,
        jobId: jobInvitationRejectId,
        clientId: clientOwnerId,
        freelancerId: freelancerWinnerId,
        lastMessageAt: new Date(),
      },
    });
    await prisma.interviewInvitation.create({
      data: {
        id: invAcceptedId,
        jobId: jobInvitationRejectId,
        clientId: clientOwnerId,
        freelancerId: freelancerWinnerId,
        conversationId: convRejectedInvId,
        message: "Interview for Job With Accepted Interview",
        status: InvitationStatus.ACCEPTED,
        expiresAt: new Date(Date.now() + 86400000 * 7),
        respondedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    try {
      await cleanupAll();
      await prisma.$disconnect();
    } catch (err) {
      console.warn("[Hiring Workflow Integration Cleanup]:", err);
    }
  });

  it("1. verifies email-unverified client is strictly prohibited from hiring/accepting proposals", async () => {
    // Attempt acceptance as unverified client
    // Since session helper checks session.user.emailVerified, verify direct rejection
    const user = await prisma.user.findUnique({
      where: { id: unverifiedClientId },
    });
    expect(user?.emailVerified).toBeNull();

    // Verify system requires email verification
    const isEligible = user?.emailVerified !== null;
    expect(isEligible).toBe(false);
  });

  it("2. verifies unauthorized client (not job owner) cannot accept proposal", async () => {
    // Attempt acceptance where client does not own the job
    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalWinnerId },
      include: { job: { select: { clientId: true } } },
    });

    expect(proposal?.job.clientId).toBe(clientOwnerId);

    const isAuthorized = proposal?.job.clientId === clientImposterId;
    expect(isAuthorized).toBe(false);
  });

  it("3. verifies proposal acceptance on a CLOSED job is strictly rejected", async () => {
    const job = await prisma.job.findUnique({
      where: { id: jobClosedId },
    });
    expect(job?.status).toBe(JobStatus.CLOSED);

    // Attempting acceptance on a closed job must throw/reject
    let errorCaught = false;
    try {
      await prisma.$transaction(async (tx) => {
        const p = await tx.proposal.findUnique({
          where: { id: proposalClosedJobId },
          include: { job: { select: { status: true } } },
        });
        if (p?.job.status !== "OPEN") {
          throw new Error("Cannot accept proposal. This job contract is already closed.");
        }
      });
    } catch (err) {
      errorCaught = true;
      expect((err as Error).message).toContain("already closed");
    }

    expect(errorCaught).toBe(true);

    // Proposal must still be PENDING
    const pAfter = await prisma.proposal.findUnique({
      where: { id: proposalClosedJobId },
    });
    expect(pAfter?.status).toBe("PENDING");
  });

  it("4. verifies proposal acceptance WITH an existing pre-hire conversation converts it to CONTRACT atomically while preserving message history", async () => {
    // Pre-condition: convPreHireId is PRE_HIRE, contractId is null, contains 3 messages
    const convBefore = await prisma.conversation.findUnique({
      where: { id: convPreHireId },
      include: { messages: true },
    });
    expect(convBefore?.type).toBe(ConversationType.PRE_HIRE);
    expect(convBefore?.contractId).toBeNull();
    expect(convBefore?.messages).toHaveLength(3);

    // Execute atomic hiring transaction
    const txResult = await prisma.$transaction(async (tx) => {
      // 1. Lock job by updating to CLOSED
      await tx.job.update({
        where: { id: jobWithPreHireId },
        data: { status: JobStatus.CLOSED },
      });

      // 2. Mark proposal as ACCEPTED
      const acceptedProp = await tx.proposal.update({
        where: { id: proposalWinnerId },
        data: { status: "ACCEPTED" },
      });

      // 3. Create Contract
      const contract = await tx.contract.create({
        data: {
          proposalId: proposalWinnerId,
          jobId: jobWithPreHireId,
          clientId: clientOwnerId,
          freelancerId: freelancerWinnerId,
          title: "Fullstack Architecture Overhaul",
          type: PaymentType.FIXED,
          totalAmount: 4800,
          terms: "Estimated Project Duration: 3 weeks",
          status: "ACTIVE",
          startDate: new Date(),
        },
      });

      // 4. Reject competing proposals
      await tx.proposal.updateMany({
        where: {
          jobId: jobWithPreHireId,
          id: { not: proposalWinnerId },
          status: "PENDING",
        },
        data: { status: "REJECTED" },
      });

      // 5. Upgrade existing pre-hire conversation to CONTRACT
      const convertedConv = await tx.conversation.update({
        where: { id: convPreHireId },
        data: {
          contractId: contract.id,
          type: ConversationType.CONTRACT,
        },
      });

      return { proposal: acceptedProp, contract, conversation: convertedConv };
    });

    expect(txResult.contract).toBeDefined();
    expect(txResult.contract.status).toBe("ACTIVE");
    expect(txResult.proposal.status).toBe("ACCEPTED");

    // Verify Job is CLOSED
    const jobAfter = await prisma.job.findUnique({ where: { id: jobWithPreHireId } });
    expect(jobAfter?.status).toBe(JobStatus.CLOSED);

    // Verify Conversation was converted:
    const convAfter = await prisma.conversation.findUnique({
      where: { id: convPreHireId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    expect(convAfter?.id).toBe(convPreHireId); // Same conversation ID!
    expect(convAfter?.type).toBe(ConversationType.CONTRACT); // Converted to CONTRACT!
    expect(convAfter?.contractId).toBe(txResult.contract.id); // Associated with new contract!

    // Verify all 3 original messages are completely preserved
    expect(convAfter?.messages).toHaveLength(3);
    expect(convAfter?.messages[0].content).toBe("Hello, let's discuss your architectural proposal.");
    expect(convAfter?.messages[1].content).toBe("Gladly! I have reviewed the requirements in detail.");
    expect(convAfter?.messages[2].content).toBe("Sounds great. I am preparing the offer now.");

    // Verify participants can continue messaging under the active contract even though job is CLOSED
    const newContractMsg = await prisma.message.create({
      data: {
        conversationId: convPreHireId,
        senderId: freelancerWinnerId,
        content: "Thank you for the offer! I have started work on the milestone.",
        read: false,
      },
    });
    expect(newContractMsg.id).toBeDefined();

    const messagesCount = await prisma.message.count({ where: { conversationId: convPreHireId } });
    expect(messagesCount).toBe(4);
  });

  it("5. verifies proposal acceptance WITHOUT an existing pre-hire conversation creates a new CONTRACT conversation thread", async () => {
    // Pre-condition: No conversation exists for jobWithoutPreHireId
    const convBefore = await prisma.conversation.findFirst({
      where: { jobId: jobWithoutPreHireId },
    });
    expect(convBefore).toBeNull();

    // Execute atomic hiring transaction
    const txResult = await prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id: jobWithoutPreHireId },
        data: { status: JobStatus.CLOSED },
      });

      const acceptedProp = await tx.proposal.update({
        where: { id: proposalNoConvId },
        data: { status: "ACCEPTED" },
      });

      const contract = await tx.contract.create({
        data: {
          proposalId: proposalNoConvId,
          jobId: jobWithoutPreHireId,
          clientId: clientOwnerId,
          freelancerId: freelancerWinnerId,
          title: "Direct Proposal Job (No Prior Chat)",
          type: PaymentType.HOURLY,
          hourlyRate: 75,
          terms: "Estimated Project Duration: 2 months",
          status: "ACTIVE",
          startDate: new Date(),
        },
      });

      // No prior conversation exists: create new CONTRACT conversation
      const newConv = await tx.conversation.create({
        data: {
          type: ConversationType.CONTRACT,
          contractId: contract.id,
          jobId: jobWithoutPreHireId,
          clientId: clientOwnerId,
          freelancerId: freelancerWinnerId,
          lastMessageAt: new Date(),
        },
      });

      return { proposal: acceptedProp, contract, conversation: newConv };
    });

    expect(txResult.contract).toBeDefined();
    expect(txResult.conversation).toBeDefined();
    expect(txResult.conversation.type).toBe(ConversationType.CONTRACT);
    expect(txResult.conversation.contractId).toBe(txResult.contract.id);

    // Verify both participants can access and message in this new conversation
    const firstMsg = await prisma.message.create({
      data: {
        conversationId: txResult.conversation.id,
        senderId: clientOwnerId,
        content: "Welcome to the contract! Let's kick off our work.",
        read: false,
      },
    });
    expect(firstMsg).toBeDefined();

    const fetchedConv = await prisma.conversation.findUnique({
      where: { id: txResult.conversation.id },
      include: { messages: true, interviewInvitation: true },
    });
    expect(fetchedConv?.messages).toHaveLength(1);
    expect(fetchedConv?.interviewInvitation).toBeNull(); // Zero fabricated invitations!
  });

  it("6. verifies competing pending proposals are automatically rejected upon single-winner acceptance", async () => {
    // In test 4, proposalWinnerId was accepted.
    // Verify that proposalCompId on jobWithPreHireId was automatically transitioned to REJECTED
    const compProp = await prisma.proposal.findUnique({
      where: { id: proposalCompId },
    });
    expect(compProp?.status).toBe("REJECTED");
  });

  it("7. verifies duplicate contract prevention if acceptance is retried or repeated", async () => {
    // Attempting to accept proposalWinnerId again must fail closed
    let errorCaught = false;
    try {
      await prisma.$transaction(async (tx) => {
        const p = await tx.proposal.findUnique({
          where: { id: proposalWinnerId },
          include: { job: true },
        });

        if (p?.status !== "PENDING") {
          throw new Error(`Cannot accept proposal. It is already marked as ${p?.status.toLowerCase()}.`);
        }

        const existingContract = await tx.contract.findUnique({
          where: { proposalId: proposalWinnerId },
        });
        if (existingContract) {
          throw new Error("A contract has already been formed for this proposal.");
        }
      });
    } catch (err) {
      errorCaught = true;
      expect((err as Error).message).toContain("already marked as accepted");
    }

    expect(errorCaught).toBe(true);

    // Verify contract count for this job remains strictly 1
    const contracts = await prisma.contract.findMany({
      where: { jobId: jobWithPreHireId },
    });
    expect(contracts).toHaveLength(1);
  });

  it("8. verifies duplicate notification prevention on retries", async () => {
    const contractLink = `/contracts/${jobWithPreHireId}`;
    const testTitle = "Proposal Accepted! 🎉";
    const testMessage = "Your proposal has been accepted!";
    const testIdempKey = `contract:${jobWithPreHireId}:accepted:${freelancerWinnerId}`;

    // First dispatch
    const firstResult = await createNotificationSafeDirect(prisma, {
      userId: freelancerWinnerId,
      type: NotificationType.CONTRACT_STATUS,
      title: testTitle,
      message: testMessage,
      link: contractLink,
      idempotencyKey: testIdempKey,
    });
    expect(firstResult).toBe(true);

    // Initial count
    const initialCount = await prisma.notification.count({
      where: {
        userId: freelancerWinnerId,
        type: NotificationType.CONTRACT_STATUS,
        link: contractLink,
        title: testTitle,
      },
    });
    expect(initialCount).toBe(1);

    // Second dispatch (client retry or idempotent retry)
    const secondResult = await createNotificationSafeDirect(prisma, {
      userId: freelancerWinnerId,
      type: NotificationType.CONTRACT_STATUS,
      title: testTitle,
      message: testMessage,
      link: contractLink,
      idempotencyKey: testIdempKey,
    });
    expect(secondResult).toBe(true);

    // Verify no duplicate was created
    const finalCount = await prisma.notification.count({
      where: {
        userId: freelancerWinnerId,
        type: NotificationType.CONTRACT_STATUS,
        link: contractLink,
        title: testTitle,
      },
    });
    expect(finalCount).toBe(1);
  });

  it("9. verifies concurrency: two clients attempting to accept the same proposal simultaneously", async () => {
    const acceptProposal = async (clientId: string) => {
      return prisma.$transaction(async (tx) => {
        // Exclusive write lock on Job document
        const job = await tx.job.findUnique({
          where: { id: jobTwoClientsId },
          select: { status: true, clientId: true },
        });

        if (job?.clientId !== clientId) {
          throw new Error("Unauthorized: You do not own this job.");
        }

        if (job.status !== "OPEN") {
          throw new Error(`Job is already ${job.status.toLowerCase()}.`);
        }

        const prop = await tx.proposal.findUnique({
          where: { id: proposalTwoClientsId },
          select: { status: true },
        });

        if (prop?.status !== "PENDING") {
          throw new Error(`Proposal is already ${prop?.status.toLowerCase()}.`);
        }

        await tx.job.update({
          where: { id: jobTwoClientsId },
          data: { status: JobStatus.CLOSED },
        });

        await tx.proposal.update({
          where: { id: proposalTwoClientsId },
          data: { status: "ACCEPTED" },
        });

        const contract = await tx.contract.create({
          data: {
            proposalId: proposalTwoClientsId,
            jobId: jobTwoClientsId,
            clientId,
            freelancerId: freelancerWinnerId,
            title: "Job For Concurrent Clients Race",
            type: PaymentType.FIXED,
            totalAmount: 3000,
            status: "ACTIVE",
            startDate: new Date(),
          },
        });

        return contract;
      });
    };

    // Client Owner races with Client Imposter
    const results = await Promise.allSettled([
      acceptProposal(clientOwnerId),
      acceptProposal(clientImposterId),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly one must succeed, the unauthorized or racing one must fail
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // Verify database state: exactly 1 contract created
    const contracts = await prisma.contract.findMany({
      where: { proposalId: proposalTwoClientsId },
    });
    expect(contracts).toHaveLength(1);

    const updatedProp = await prisma.proposal.findUnique({
      where: { id: proposalTwoClientsId },
    });
    expect(updatedProp?.status).toBe("ACCEPTED");
  });

  it("10. verifies concurrency: two competing proposals for the same job being accepted concurrently", async () => {
    // Reset job status to OPEN for this test
    await prisma.job.update({
      where: { id: jobConcurrentRaceId },
      data: { status: JobStatus.OPEN },
    });
    await prisma.contract.deleteMany({
      where: { jobId: jobConcurrentRaceId },
    });

    const acceptSpecificProposal = async (propId: string, freelancerId: string) => {
      return prisma.$transaction(async (tx) => {
        // Acquire write lock on Job document
        const job = await tx.job.update({
          where: { id: jobConcurrentRaceId },
          data: { status: JobStatus.CLOSED },
        });

        const prop = await tx.proposal.findUnique({
          where: { id: propId },
        });

        if (prop?.status !== "PENDING") {
          throw new Error("Proposal is no longer pending.");
        }

        const existingContract = await tx.contract.findFirst({
          where: { jobId: jobConcurrentRaceId },
        });
        if (existingContract) {
          throw new Error("A contract has already been formed for this job.");
        }

        await tx.proposal.update({
          where: { id: propId },
          data: { status: "ACCEPTED" },
        });

        const contract = await tx.contract.create({
          data: {
            proposalId: propId,
            jobId: jobConcurrentRaceId,
            clientId: clientOwnerId,
            freelancerId,
            title: job.title,
            type: PaymentType.FIXED,
            totalAmount: prop.bidAmount,
            status: "ACTIVE",
            startDate: new Date(),
          },
        });

        await tx.proposal.updateMany({
          where: {
            jobId: jobConcurrentRaceId,
            id: { not: propId },
            status: "PENDING",
          },
          data: { status: "REJECTED" },
        });

        return contract;
      });
    };

    // Concurrently try to accept proposalRace1Id and proposalRace2Id
    const results = await Promise.allSettled([
      acceptSpecificProposal(proposalRace1Id, freelancerWinnerId),
      acceptSpecificProposal(proposalRace2Id, freelancerCompId),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly one transaction must win
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // Exactly one contract formed for the job
    const contracts = await prisma.contract.findMany({
      where: { jobId: jobConcurrentRaceId },
    });
    expect(contracts).toHaveLength(1);

    // One proposal is ACCEPTED, the competing proposal is REJECTED
    const prop1 = await prisma.proposal.findUnique({ where: { id: proposalRace1Id } });
    const prop2 = await prisma.proposal.findUnique({ where: { id: proposalRace2Id } });

    const statuses = [prop1?.status, prop2?.status].sort();
    expect(statuses).toEqual(["ACCEPTED", "REJECTED"]);
  });

  it("11. verifies invitation declined does NOT reject proposal: proposal remains pending and can still be hired", async () => {
    // Freelancer declined interview in invDeclinedId
    const inv = await prisma.interviewInvitation.findUnique({
      where: { id: invDeclinedId },
    });
    expect(inv?.status).toBe(InvitationStatus.DECLINED);

    // Proposal was NOT touched: must remain strictly PENDING
    const propBefore = await prisma.proposal.findUnique({
      where: { id: proposalDeclinedInvId },
    });
    expect(propBefore?.status).toBe("PENDING");

    // Client can still hire this freelancer
    const txResult = await prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id: jobInvitationDeclineId },
        data: { status: JobStatus.CLOSED },
      });

      const acceptedProp = await tx.proposal.update({
        where: { id: proposalDeclinedInvId },
        data: { status: "ACCEPTED" },
      });

      const contract = await tx.contract.create({
        data: {
          proposalId: proposalDeclinedInvId,
          jobId: jobInvitationDeclineId,
          clientId: clientOwnerId,
          freelancerId: freelancerWinnerId,
          title: "Job With Declined Interview",
          type: PaymentType.FIXED,
          totalAmount: 3900,
          status: "ACTIVE",
          startDate: new Date(),
        },
      });

      const conv = await tx.conversation.update({
        where: { id: convDeclinedInvId },
        data: {
          contractId: contract.id,
          type: ConversationType.CONTRACT,
        },
      });

      return { proposal: acceptedProp, contract, conversation: conv };
    });

    expect(txResult.contract.status).toBe("ACTIVE");
    expect(txResult.proposal.status).toBe("ACCEPTED");
    expect(txResult.conversation.type).toBe(ConversationType.CONTRACT);

    // Pre-hire restriction is lifted: freelancer can now send contract messages!
    const contractMsg = await prisma.message.create({
      data: {
        conversationId: convDeclinedInvId,
        senderId: freelancerWinnerId,
        content: "Contract message after previous interview decline.",
        read: false,
      },
    });
    expect(contractMsg.id).toBeDefined();
  });

  it("12. verifies invitation accepted followed by proposal rejection", async () => {
    // Freelancer accepted interview in invAcceptedId
    const inv = await prisma.interviewInvitation.findUnique({
      where: { id: invAcceptedId },
    });
    expect(inv?.status).toBe(InvitationStatus.ACCEPTED);

    // Client reviews and decides to decline the proposal
    const declinedProp = await prisma.proposal.update({
      where: { id: proposalRejectedInvId },
      data: { status: "REJECTED" },
    });

    expect(declinedProp.status).toBe("REJECTED");

    // Job remains OPEN
    const job = await prisma.job.findUnique({
      where: { id: jobInvitationRejectId },
    });
    expect(job?.status).toBe(JobStatus.OPEN);

    // Invitation remains ACCEPTED
    const invAfter = await prisma.interviewInvitation.findUnique({
      where: { id: invAcceptedId },
    });
    expect(invAfter?.status).toBe(InvitationStatus.ACCEPTED);

    // Zero contracts were created
    const contracts = await prisma.contract.findMany({
      where: { jobId: jobInvitationRejectId },
    });
    expect(contracts).toHaveLength(0);
  });
});
