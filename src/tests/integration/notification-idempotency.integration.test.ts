// src/tests/integration/notification-idempotency.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient, Prisma, NotificationType, ContractStatus, JobStatus } from "@prisma/client";

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

import { createNotificationSafe } from "@/lib/actions/notification";
import { prisma as globalPrisma } from "@/lib/prisma";

const isIntegrationRun = process.env.WORKPULSE_INTEGRATION_RUN === "true";
const testDbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || "";

describe("WorkPulse Phase 3 Batch 4: Notification Idempotency & Delivery Integrity (Replica Set Tests)", () => {
  if (!isIntegrationRun) {
    it.skip("skips database integration test during standard unit test run (run 'npm run test:integration')", () => {
      // Skipped during unit test run
    });
    return;
  }

  const prisma = new PrismaClient({
    datasources: {
      db: { url: testDbUrl },
    },
  });

  const testClientId = "672728ef2bc3901a88b839aa";
  const testFreelancer1Id = "672728ef2bc3901a88b839bb";
  const testFreelancer2Id = "672728ef2bc3901a88b839cc";
  const testJobId = "672728ef2bc3901a88b839dd";
  const testContractId = "672728ef2bc3901a88b839ee";

  beforeAll(async () => {
    // 1. Ensure partial unique index exists on notifications.idempotencyKey
    try {
      await prisma.$runCommandRaw({
        createIndexes: "notifications",
        indexes: [
          {
            key: { idempotencyKey: 1 },
            name: "notifications_idempotencyKey_unique",
            unique: true,
            partialFilterExpression: {
              idempotencyKey: { $type: "string" },
            },
          },
        ],
      });
    } catch {
      // Index already configured
    }

    // 2. Clean up any previous fixtures
    await cleanup();

    // 3. Seed users & test job
    await prisma.user.createMany({
      data: [
        {
          id: testClientId,
          email: "client_notif_test@workpulse.internal",
          name: "Test Client",
          role: "CLIENT",
        },
        {
          id: testFreelancer1Id,
          email: "free1_notif_test@workpulse.internal",
          name: "Freelancer One",
          role: "FREELANCER",
        },
        {
          id: testFreelancer2Id,
          email: "free2_notif_test@workpulse.internal",
          name: "Freelancer Two",
          role: "FREELANCER",
        },
      ],
    });

    await prisma.job.create({
      data: {
        id: testJobId,
        clientId: testClientId,
        title: "Enterprise Full-Stack Cloud Architecture",
        description: "Integration testing job for notification delivery.",
        category: "Software Development",
        status: JobStatus.OPEN,
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  async function cleanup() {
    try {
      await prisma.notification.deleteMany({
        where: {
          userId: { in: [testClientId, testFreelancer1Id, testFreelancer2Id] },
        },
      });
      await prisma.contract.deleteMany({
        where: { id: testContractId },
      });
      await prisma.proposal.deleteMany({
        where: { jobId: testJobId },
      });
      await prisma.job.deleteMany({
        where: { id: testJobId },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [testClientId, testFreelancer1Id, testFreelancer2Id] } },
      });
    } catch {
      // Ignore cleanup error
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Two different freelancers submit proposals to the same job
  // ---------------------------------------------------------------------------
  it("1. creates notifications for two different freelancers applying to the same job (no accidental suppression)", async () => {
    const prop1Id = "672728ef2bc3901a88b83901";
    const prop2Id = "672728ef2bc3901a88b83902";

    const key1 = `proposal:${prop1Id}:submitted`;
    const key2 = `proposal:${prop2Id}:submitted`;

    const res1 = await createNotificationSafe({
      userId: testClientId,
      type: NotificationType.CONTRACT_STATUS,
      title: "New Proposal Received",
      message: "Freelancer One submitted a proposal of $1000.",
      link: `/dashboard/client/jobs/${testJobId}/proposals`,
      idempotencyKey: key1,
    });
    expect(res1).toBe(true);

    const res2 = await createNotificationSafe({
      userId: testClientId,
      type: NotificationType.CONTRACT_STATUS,
      title: "New Proposal Received",
      message: "Freelancer Two submitted a proposal of $1200.",
      link: `/dashboard/client/jobs/${testJobId}/proposals`,
      idempotencyKey: key2,
    });
    expect(res2).toBe(true);

    const notifs = await prisma.notification.findMany({
      where: {
        userId: testClientId,
        title: "New Proposal Received",
      },
    });

    expect(notifs).toHaveLength(2);
    const keys = notifs.map((n) => n.idempotencyKey).sort();
    expect(keys).toEqual([key1, key2].sort());
  });

  // ---------------------------------------------------------------------------
  // 2. The same proposal notification is dispatched twice
  // ---------------------------------------------------------------------------
  it("2. dispatches the same proposal notification twice and produces exactly one record", async () => {
    const prop1Id = "672728ef2bc3901a88b83901";
    const key1 = `proposal:${prop1Id}:submitted`;

    // Second dispatch (e.g. client retry or network timeout retry)
    const retryResult = await createNotificationSafe({
      userId: testClientId,
      type: NotificationType.CONTRACT_STATUS,
      title: "New Proposal Received",
      message: "Freelancer One submitted a proposal of $1000.",
      link: `/dashboard/client/jobs/${testJobId}/proposals`,
      idempotencyKey: key1,
    });

    expect(retryResult).toBe(true);

    const count = await prisma.notification.count({
      where: { idempotencyKey: key1 },
    });
    expect(count).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 3. Two concurrent requests dispatch the same event
  // ---------------------------------------------------------------------------
  it("3. handles concurrent requests for the same event and creates exactly one notification", async () => {
    const concurrentKey = `concurrent:test:event:${Date.now()}`;

    const [resA, resB] = await Promise.all([
      createNotificationSafe({
        userId: testClientId,
        type: NotificationType.CONTRACT_STATUS,
        title: "Concurrent Action Alert",
        message: "Simultaneous execution attempt.",
        link: "/dashboard/client",
        idempotencyKey: concurrentKey,
      }),
      createNotificationSafe({
        userId: testClientId,
        type: NotificationType.CONTRACT_STATUS,
        title: "Concurrent Action Alert",
        message: "Simultaneous execution attempt.",
        link: "/dashboard/client",
        idempotencyKey: concurrentKey,
      }),
    ]);

    expect(resA).toBe(true);
    expect(resB).toBe(true);

    const count = await prisma.notification.count({
      where: { idempotencyKey: concurrentKey },
    });
    expect(count).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 4. Two different events with identical titles and links
  // ---------------------------------------------------------------------------
  it("4. creates separate notifications for two different events with identical titles and links", async () => {
    const declined1Key = "proposal:672728ef2bc3901a88b83903:declined";
    const declined2Key = "proposal:672728ef2bc3901a88b83904:declined";

    const resA = await createNotificationSafe({
      userId: testFreelancer1Id,
      type: NotificationType.CONTRACT_STATUS,
      title: "Proposal Update",
      message: "Your proposal for Enterprise Architecture was declined.",
      link: `/jobs/${testJobId}`,
      idempotencyKey: declined1Key,
    });
    expect(resA).toBe(true);

    const resB = await createNotificationSafe({
      userId: testFreelancer1Id,
      type: NotificationType.CONTRACT_STATUS,
      title: "Proposal Update",
      message: "Another proposal was also reviewed and declined.",
      link: `/jobs/${testJobId}`,
      idempotencyKey: declined2Key,
    });
    expect(resB).toBe(true);

    const count = await prisma.notification.count({
      where: {
        userId: testFreelancer1Id,
        title: "Proposal Update",
        link: `/jobs/${testJobId}`,
      },
    });
    expect(count).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // 5. Two distinct PAUSED transitions with the same millisecond timestamp
  // ---------------------------------------------------------------------------
  it("5. preserves both distinct PAUSED notifications even if they share the exact same timestamp", async () => {
    // Under old timestamp design, two pause events at identical timestamp would produce collision.
    // Under lifecycleVersion design, transitions advance monotonically: v2 and v4.
    const pause1Key = `contract:${testContractId}:status:PAUSED:v2`;
    const resumeKey = `contract:${testContractId}:status:ACTIVE:v3`;
    const pause2Key = `contract:${testContractId}:status:PAUSED:v4`;

    // 1. Initial Pause (v2)
    const resPause1 = await createNotificationSafe({
      userId: testFreelancer1Id,
      type: NotificationType.CONTRACT_STATUS,
      title: "Contract Status Updated: PAUSED",
      message: "Contract paused by client for review.",
      link: `/contracts/${testContractId}`,
      idempotencyKey: pause1Key,
    });
    expect(resPause1).toBe(true);

    // 2. Resume to Active (v3)
    const resResume = await createNotificationSafe({
      userId: testFreelancer1Id,
      type: NotificationType.CONTRACT_STATUS,
      title: "Contract Status Updated: ACTIVE",
      message: "Contract resumed to active.",
      link: `/contracts/${testContractId}`,
      idempotencyKey: resumeKey,
    });
    expect(resResume).toBe(true);

    // 3. Second Pause (v4) - occurring at the exact same millisecond timestamp
    const resPause2 = await createNotificationSafe({
      userId: testFreelancer1Id,
      type: NotificationType.CONTRACT_STATUS,
      title: "Contract Status Updated: PAUSED",
      message: "Contract paused once again.",
      link: `/contracts/${testContractId}`,
      idempotencyKey: pause2Key,
    });
    expect(resPause2).toBe(true);

    const pauseNotifs = await prisma.notification.findMany({
      where: {
        userId: testFreelancer1Id,
        title: "Contract Status Updated: PAUSED",
      },
      orderBy: { createdAt: "asc" },
    });

    // Both distinct pause events MUST be preserved in the database without collision
    expect(pauseNotifs).toHaveLength(2);
    expect(pauseNotifs.map((n) => n.idempotencyKey).sort()).toEqual([pause1Key, pause2Key].sort());
  });

  // ---------------------------------------------------------------------------
  // 5b. Two distinct milestone lifecycle events with identical timestamps
  // ---------------------------------------------------------------------------
  it("5b. preserves distinct milestone submission and approval events even with identical timestamps", async () => {
    const testMilestoneId = "672728ef2bc3901a88b83977";
    const submitKey = `milestone:${testMilestoneId}:submitted:v2`;
    const approveKey = `milestone:${testMilestoneId}:approved:v3`;

    const resSubmit = await createNotificationSafe({
      userId: testClientId,
      type: NotificationType.MILESTONE_SUBMITTED,
      title: "Milestone Deliverable Submitted",
      message: "A milestone was submitted for your review.",
      link: `/contracts/${testContractId}`,
      idempotencyKey: submitKey,
    });
    expect(resSubmit).toBe(true);

    const resApprove = await createNotificationSafe({
      userId: testFreelancer1Id,
      type: NotificationType.MILESTONE_APPROVED,
      title: "Milestone Approved!",
      message: "Your milestone was approved by the client.",
      link: `/contracts/${testContractId}`,
      idempotencyKey: approveKey,
    });
    expect(resApprove).toBe(true);

    const milestoneNotifs = await prisma.notification.findMany({
      where: {
        idempotencyKey: { in: [submitKey, approveKey] },
      },
    });

    expect(milestoneNotifs).toHaveLength(2);
    expect(milestoneNotifs.map((n) => n.idempotencyKey).sort()).toEqual([submitKey, approveKey].sort());
  });

  // ---------------------------------------------------------------------------
  // 6. Retrying the same event produces only one notification
  // ---------------------------------------------------------------------------
  it("6. produces no duplicate when a contract lifecycle event is retried", async () => {
    const retryEventKey = `contract:${testContractId}:status:PAUSED:v4`;

    const retryResult = await createNotificationSafe({
      userId: testFreelancer1Id,
      type: NotificationType.CONTRACT_STATUS,
      title: "Contract Status Updated: PAUSED",
      message: "Contract paused once again.",
      link: `/contracts/${testContractId}`,
      idempotencyKey: retryEventKey,
    });
    expect(retryResult).toBe(true);

    const count = await prisma.notification.count({
      where: { idempotencyKey: retryEventKey },
    });
    expect(count).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 6b. Unrelated unique constraint errors are NOT absorbed
  // ---------------------------------------------------------------------------
  it("6b. does NOT absorb unrelated unique constraint errors and returns false", async () => {
    const originalCreate = globalPrisma.notification.create;

    // Simulate Prisma P2002 error targeting an unrelated unique constraint (e.g. users_email_key)
    const unrelatedP2002 = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the constraint: users_email_key",
      {
        code: "P2002",
        clientVersion: "6.19.3",
        meta: { target: ["email"] },
      }
    );

    (globalPrisma.notification as unknown as { create: unknown }).create = vi
      .fn()
      .mockRejectedValueOnce(unrelatedP2002);

    try {
      const res = await createNotificationSafe({
        userId: testFreelancer1Id,
        type: NotificationType.CONTRACT_STATUS,
        title: "Test Alert",
        message: "Simulated unrelated unique violation.",
        link: `/contracts/${testContractId}`,
        idempotencyKey: `contract:${testContractId}:unrelated:test`,
      });

      // Must NOT absorb unrelated unique violation
      expect(res).toBe(false);
    } finally {
      globalPrisma.notification.create = originalCreate;
    }

    // Also simulate raw MongoDB 11000 duplicate key error targeting an unrelated collection/index
    const unrelatedMongo11000 = Object.assign(
      new Error("E11000 duplicate key error collection: workpulse_test.User index: users_email_unique dup key: { email: 'client@example.com' }"),
      { code: 11000, keyPattern: { email: 1 } }
    );

    (globalPrisma.notification as unknown as { create: unknown }).create = vi
      .fn()
      .mockRejectedValueOnce(unrelatedMongo11000);

    try {
      const res = await createNotificationSafe({
        userId: testFreelancer1Id,
        type: NotificationType.CONTRACT_STATUS,
        title: "Test Alert",
        message: "Simulated unrelated mongo 11000 violation.",
        link: `/contracts/${testContractId}`,
        idempotencyKey: `contract:${testContractId}:unrelated:mongo_test`,
      });

      // Must NOT absorb unrelated mongo 11000 violation
      expect(res).toBe(false);
    } finally {
      globalPrisma.notification.create = originalCreate;
    }
  });

  // ---------------------------------------------------------------------------
  // 6c. Transient database errors return false
  // ---------------------------------------------------------------------------
  it("6c. returns false on transient database failures", async () => {
    const originalCreate = globalPrisma.notification.create;

    // Simulate transient connection timeout
    const transientTimeout = new Prisma.PrismaClientKnownRequestError(
      "Timed out fetching a new connection from the connection pool.",
      {
        code: "P2024",
        clientVersion: "6.19.3",
      }
    );

    (globalPrisma.notification as unknown as { create: unknown }).create = vi
      .fn()
      .mockRejectedValueOnce(transientTimeout);

    try {
      const res = await createNotificationSafe({
        userId: testFreelancer1Id,
        type: NotificationType.CONTRACT_STATUS,
        title: "Test Alert",
        message: "Simulated transient timeout.",
        link: `/contracts/${testContractId}`,
        idempotencyKey: `contract:${testContractId}:transient:test`,
      });

      expect(res).toBe(false);
    } finally {
      globalPrisma.notification.create = originalCreate;
    }
  });

  // ---------------------------------------------------------------------------
  // 7. Notification failure does not roll back a committed contract
  // ---------------------------------------------------------------------------
  it("7. ensures notification failure does not roll back an already committed contract", async () => {
    // 1. Commit contract in transaction
    const newContract = await prisma.$transaction(async (tx) => {
      const prop = await tx.proposal.create({
        data: {
          jobId: testJobId,
          freelancerId: testFreelancer1Id,
          coverLetter: "Detailed proposal for architecture contract.",
          bidAmount: 5000,
          status: "ACCEPTED",
        },
      });

      return tx.contract.create({
        data: {
          id: testContractId,
          jobId: testJobId,
          proposalId: prop.id,
          clientId: testClientId,
          freelancerId: testFreelancer1Id,
          title: "Enterprise Architecture Contract",
          status: ContractStatus.ACTIVE,
        },
      });
    });

    expect(newContract).toBeDefined();
    expect(newContract.status).toBe(ContractStatus.ACTIVE);

    // 2. Simulate post-commit notification failure (e.g. database error during dispatch)
    const originalCreate = globalPrisma.notification.create;
    (globalPrisma.notification as unknown as { create: unknown }).create = vi
      .fn()
      .mockRejectedValueOnce(new Error("Database connection severed during notification create"));

    try {
      const notifResult = await createNotificationSafe({
        userId: testFreelancer1Id,
        type: NotificationType.CONTRACT_STATUS,
        title: "Contract Created Alert",
        message: "Simulated failed delivery.",
        link: `/contracts/${newContract.id}`,
        idempotencyKey: `contract:${newContract.id}:accepted:failure_test`,
      });

      // Safe helper catches failure and returns false without throwing
      expect(notifResult).toBe(false);
    } finally {
      globalPrisma.notification.create = originalCreate;
    }

    // 3. Verify contract is completely intact in the database
    const survivingContract = await prisma.contract.findUnique({
      where: { id: testContractId },
    });
    expect(survivingContract).not.toBeNull();
    expect(survivingContract?.status).toBe(ContractStatus.ACTIVE);
  });

  // ---------------------------------------------------------------------------
  // 8. Existing historical notifications remain accessible
  // ---------------------------------------------------------------------------
  it("8. ensures existing historical notifications without idempotency keys remain accessible", async () => {
    // Seed 2 historical notifications with null idempotencyKey
    await prisma.notification.createMany({
      data: [
        {
          userId: testClientId,
          type: NotificationType.NEW_MESSAGE,
          title: "Historical Notification 1",
          message: "Legacy message before idempotency migration.",
          link: "/messages",
        },
        {
          userId: testClientId,
          type: NotificationType.NEW_MESSAGE,
          title: "Historical Notification 2",
          message: "Another legacy message without idempotency key.",
          link: "/messages",
        },
      ],
    });

    const historical = await prisma.notification.findMany({
      where: {
        userId: testClientId,
        title: { startsWith: "Historical Notification" },
      },
    });

    expect(historical).toHaveLength(2);
    expect(historical[0].idempotencyKey).toBeNull();
    expect(historical[1].idempotencyKey).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 9. Interview invitation notifications remain correctly deduplicated
  // ---------------------------------------------------------------------------
  it("9. deduplicates interview invitation notifications on retry", async () => {
    const invId = "672728ef2bc3901a88b83955";
    const invKey = `invitation:${invId}:sent`;

    const res1 = await createNotificationSafe({
      userId: testFreelancer2Id,
      type: NotificationType.INTERVIEW_INVITATION,
      title: "Interview Invitation Received! 🎯",
      message: "Test Client invited you to interview.",
      link: `/messages?invitationId=${invId}`,
      idempotencyKey: invKey,
    });
    expect(res1).toBe(true);

    // Idempotent retry
    const res2 = await createNotificationSafe({
      userId: testFreelancer2Id,
      type: NotificationType.INTERVIEW_INVITATION,
      title: "Interview Invitation Received! 🎯",
      message: "Test Client invited you to interview.",
      link: `/messages?invitationId=${invId}`,
      idempotencyKey: invKey,
    });
    expect(res2).toBe(true);

    const count = await prisma.notification.count({
      where: { idempotencyKey: invKey },
    });
    expect(count).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 10. Message notifications remain distinct for different messages
  // ---------------------------------------------------------------------------
  it("10. creates distinct notifications for different messages between the same users", async () => {
    const msg1Id = "672728ef2bc3901a88b83961";
    const msg2Id = "672728ef2bc3901a88b83962";

    const key1 = `message:${msg1Id}:sent`;
    const key2 = `message:${msg2Id}:sent`;

    const resA = await createNotificationSafe({
      userId: testFreelancer2Id,
      type: NotificationType.NEW_MESSAGE,
      title: "New message from Test Client",
      message: "First message content.",
      link: "/messages",
      idempotencyKey: key1,
    });
    expect(resA).toBe(true);

    const resB = await createNotificationSafe({
      userId: testFreelancer2Id,
      type: NotificationType.NEW_MESSAGE,
      title: "New message from Test Client",
      message: "Second message content.",
      link: "/messages",
      idempotencyKey: key2,
    });
    expect(resB).toBe(true);

    const notifs = await prisma.notification.findMany({
      where: {
        userId: testFreelancer2Id,
        idempotencyKey: { in: [key1, key2] },
      },
    });

    expect(notifs).toHaveLength(2);
  });
});
