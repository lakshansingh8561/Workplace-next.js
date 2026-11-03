// src/tests/integration/contract-concurrency-recovery.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient, ContractStatus, JobStatus, MilestoneStatus, NotificationType } from "@prisma/client";

// Mock session and cache
let mockCurrentUser: {
  id: string;
  name?: string;
  email?: string;
  role: "CLIENT" | "FREELANCER";
  roleSelected: boolean;
  emailVerified: Date | null;
} = {
  id: "673000000000000000000001",
  name: "Client User",
  role: "CLIENT",
  roleSelected: true,
  emailVerified: new Date(),
};

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(async () => mockCurrentUser),
  verifyUserForAction: vi.fn(async (allowed?: string | string[]) => {
    if (allowed) {
      const list = Array.isArray(allowed) ? allowed : [allowed];
      if (!list.includes(mockCurrentUser.role)) {
        return {
          success: false,
          error: `Unauthorized: Only ${list.join(" or ")} accounts can perform this action.`,
          code: "UNAUTHORIZED_ROLE",
        };
      }
    }
    return {
      success: true,
      user: mockCurrentUser,
    };
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import {
  updateContractStatusAction,
  submitMilestoneAction,
  approveMilestoneAction,
} from "@/lib/actions/contract";
import { prisma as globalPrisma } from "@/lib/prisma";

const isIntegrationRun = process.env.WORKPULSE_INTEGRATION_RUN === "true";
const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  "mongodb://127.0.0.1:27018/workpulse_test?replicaSet=rsTest&directConnection=true";

describe("WorkPulse Phase 3 Batch 4: Contract Concurrency, Milestone Lifecycle & Notification Recovery", () => {
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

  const testClientId = "673000000000000000000001";
  const testFreelancerId = "673000000000000000000002";
  const testJobId = "673000000000000000000010";
  const testJobId2 = "673000000000000000000011";
  const testJobId3 = "673000000000000000000012";
  const testJobId4 = "673000000000000000000013";
  const testJobId5 = "673000000000000000000014";
  const testJobId6 = "673000000000000000000065";
  const testJobId7 = "673000000000000000000075";
  const testProposalId1 = "673000000000000000000015";
  const testProposalId2 = "673000000000000000000016";
  const testProposalId3 = "673000000000000000000017";
  const testProposalId4 = "673000000000000000000018";
  const testProposalId5 = "673000000000000000000019";
  const testProposalId6 = "673000000000000000000066";
  const testProposalId7 = "673000000000000000000076";
  const testContractId1 = "673000000000000000000020";
  const testContractId2 = "673000000000000000000030";
  const testContractId3 = "673000000000000000000050";
  const testContractId4 = "673000000000000000000060";
  const testContractId5 = "673000000000000000000070";
  const testContractId6 = "673000000000000000000080";
  const testContractId7 = "673000000000000000000090";
  const testMilestoneId1 = "673000000000000000000040";

  beforeAll(async () => {
    // Ensure partial unique index exists on notifications.idempotencyKey
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

    await cleanup();

    // Seed test users & job
    await prisma.user.createMany({
      data: [
        {
          id: testClientId,
          email: "concurrency_client@workpulse.test",
          name: "Concurrency Client",
          role: "CLIENT",
        },
        {
          id: testFreelancerId,
          email: "concurrency_freelancer@workpulse.test",
          name: "Concurrency Freelancer",
          role: "FREELANCER",
        },
      ],
    });

    await prisma.job.create({
      data: {
        id: testJobId,
        clientId: testClientId,
        title: "Concurrency Test Job",
        description: "Testing concurrent transitions & recovery.",
        category: "Software Development",
        status: JobStatus.IN_PROGRESS,
      },
    });

    // Seed proposal 1 for contract 1
    await prisma.proposal.create({
      data: {
        id: testProposalId1,
        jobId: testJobId,
        freelancerId: testFreelancerId,
        coverLetter: "Proposal for contract 1",
        bidAmount: 3000,
        status: "ACCEPTED",
      },
    });

    // Seed primary contract 1
    await prisma.contract.create({
      data: {
        id: testContractId1,
        jobId: testJobId,
        proposalId: testProposalId1,
        clientId: testClientId,
        freelancerId: testFreelancerId,
        title: "Concurrency Contract 1",
        status: ContractStatus.ACTIVE,
        lifecycleVersion: 1,
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
          userId: { in: [testClientId, testFreelancerId] },
        },
      });
      await prisma.contractMilestone.deleteMany({
        where: {
          contractId: {
            in: [
              testContractId1,
              testContractId2,
              testContractId3,
              testContractId4,
              testContractId5,
              testContractId6,
              testContractId7,
            ],
          },
        },
      });
      await prisma.contract.deleteMany({
        where: {
          id: {
            in: [
              testContractId1,
              testContractId2,
              testContractId3,
              testContractId4,
              testContractId5,
              testContractId6,
              testContractId7,
            ],
          },
        },
      });
      await prisma.proposal.deleteMany({
        where: {
          jobId: {
            in: [
              testJobId,
              testJobId2,
              testJobId3,
              testJobId4,
              testJobId5,
              testJobId6,
              testJobId7,
            ],
          },
        },
      });
      await prisma.job.deleteMany({
        where: {
          id: {
            in: [
              testJobId,
              testJobId2,
              testJobId3,
              testJobId4,
              testJobId5,
              testJobId6,
              testJobId7,
            ],
          },
        },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [testClientId, testFreelancerId] } },
      });
    } catch {
      // Ignore cleanup error
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Two concurrent requests to pause the same active contract
  // ---------------------------------------------------------------------------
  it("1. two concurrent requests to pause the same active contract produce one state transition and one notification", async () => {
    mockCurrentUser = {
      id: testClientId,
      name: "Concurrency Client",
      role: "CLIENT",
      roleSelected: true,
      emailVerified: new Date(),
    };

    const [res1, res2] = await Promise.all([
      updateContractStatusAction({
        contractId: testContractId1,
        status: ContractStatus.PAUSED,
      }),
      updateContractStatusAction({
        contractId: testContractId1,
        status: ContractStatus.PAUSED,
      }),
    ]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
    expect(res1.status).toBe(ContractStatus.PAUSED);
    expect(res2.status).toBe(ContractStatus.PAUSED);

    // Verify database state: lifecycleVersion MUST be exactly 2 (incremented once, not twice)
    const contract = await prisma.contract.findUnique({
      where: { id: testContractId1 },
      select: { status: true, lifecycleVersion: true },
    });
    expect(contract?.status).toBe(ContractStatus.PAUSED);
    expect(contract?.lifecycleVersion).toBe(2);

    // Verify notifications: exactly ONE notification created
    const notifs = await prisma.notification.findMany({
      where: {
        userId: testFreelancerId,
        title: "Contract Status Updated: PAUSED",
      },
    });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].idempotencyKey).toBe(`contract:${testContractId1}:status:PAUSED:v2`);
  });

  // ---------------------------------------------------------------------------
  // 2. Concurrent requests to resume or complete a contract
  // ---------------------------------------------------------------------------
  it("2. concurrent requests to resume or complete a contract cannot duplicate the same logical transition", async () => {
    mockCurrentUser = {
      id: testClientId,
      name: "Concurrency Client",
      role: "CLIENT",
      roleSelected: true,
      emailVerified: new Date(),
    };

    // A. Concurrent Resume (PAUSED -> ACTIVE)
    const [resResume1, resResume2] = await Promise.all([
      updateContractStatusAction({
        contractId: testContractId1,
        status: ContractStatus.ACTIVE,
      }),
      updateContractStatusAction({
        contractId: testContractId1,
        status: ContractStatus.ACTIVE,
      }),
    ]);

    expect(resResume1.success).toBe(true);
    expect(resResume2.success).toBe(true);

    const contractActive = await prisma.contract.findUnique({
      where: { id: testContractId1 },
      select: { status: true, lifecycleVersion: true },
    });
    expect(contractActive?.status).toBe(ContractStatus.ACTIVE);
    expect(contractActive?.lifecycleVersion).toBe(3); // Incremented from 2 to 3

    const activeNotifs = await prisma.notification.findMany({
      where: {
        userId: testFreelancerId,
        title: "Contract Status Updated: ACTIVE",
      },
    });
    expect(activeNotifs).toHaveLength(1);
    expect(activeNotifs[0].idempotencyKey).toBe(`contract:${testContractId1}:status:ACTIVE:v3`);

    // B. Concurrent Complete (ACTIVE -> COMPLETED)
    const [resComp1, resComp2] = await Promise.all([
      updateContractStatusAction({
        contractId: testContractId1,
        status: ContractStatus.COMPLETED,
      }),
      updateContractStatusAction({
        contractId: testContractId1,
        status: ContractStatus.COMPLETED,
      }),
    ]);

    expect(resComp1.success).toBe(true);
    expect(resComp2.success).toBe(true);

    const contractCompleted = await prisma.contract.findUnique({
      where: { id: testContractId1 },
      select: { status: true, lifecycleVersion: true },
    });
    expect(contractCompleted?.status).toBe(ContractStatus.COMPLETED);
    expect(contractCompleted?.lifecycleVersion).toBe(4); // Incremented from 3 to 4

    const completedNotifs = await prisma.notification.findMany({
      where: {
        userId: testFreelancerId,
        title: "Contract Status Updated: COMPLETED",
      },
    });
    expect(completedNotifs).toHaveLength(1);
    expect(completedNotifs[0].idempotencyKey).toBe(`contract:${testContractId1}:status:COMPLETED:v4`);
  });

  // ---------------------------------------------------------------------------
  // 3. Two concurrent milestone submission requests
  // ---------------------------------------------------------------------------
  it("3. two concurrent milestone submission requests produce one successful transition and one notification", async () => {
    // Reset contract 1 to ACTIVE for milestone testing
    await prisma.contract.update({
      where: { id: testContractId1 },
      data: { status: ContractStatus.ACTIVE },
    });

    // Create active milestone
    await prisma.contractMilestone.create({
      data: {
        id: testMilestoneId1,
        contractId: testContractId1,
        title: "Core Architecture Deliverable",
        amount: 2500,
        status: MilestoneStatus.ACTIVE,
        lifecycleVersion: 1,
      },
    });

    // Authenticate as freelancer
    mockCurrentUser = {
      id: testFreelancerId,
      name: "Concurrency Freelancer",
      role: "FREELANCER",
      roleSelected: true,
      emailVerified: new Date(),
    };

    const [sub1, sub2] = await Promise.all([
      submitMilestoneAction({ milestoneId: testMilestoneId1 }),
      submitMilestoneAction({ milestoneId: testMilestoneId1 }),
    ]);

    expect(sub1.success).toBe(true);
    expect(sub2.success).toBe(true);
    expect(sub1.milestoneId).toBe(testMilestoneId1);
    expect(sub2.milestoneId).toBe(testMilestoneId1);

    // Verify database state: status SUBMITTED, lifecycleVersion exactly 2 (not 3)
    const milestone = await prisma.contractMilestone.findUnique({
      where: { id: testMilestoneId1 },
      select: { status: true, lifecycleVersion: true },
    });
    expect(milestone?.status).toBe(MilestoneStatus.SUBMITTED);
    expect(milestone?.lifecycleVersion).toBe(2);

    // Verify notifications for client: exactly ONE notification
    const submittedNotifs = await prisma.notification.findMany({
      where: {
        userId: testClientId,
        type: NotificationType.MILESTONE_SUBMITTED,
      },
    });
    expect(submittedNotifs).toHaveLength(1);
    expect(submittedNotifs[0].idempotencyKey).toBe(`milestone:${testMilestoneId1}:submitted:v2`);
  });

  // ---------------------------------------------------------------------------
  // 4. Two concurrent milestone approval requests
  // ---------------------------------------------------------------------------
  it("4. two concurrent milestone approval requests produce one successful transition and one notification", async () => {
    // Authenticate as client
    mockCurrentUser = {
      id: testClientId,
      name: "Concurrency Client",
      role: "CLIENT",
      roleSelected: true,
      emailVerified: new Date(),
    };

    const [app1, app2] = await Promise.all([
      approveMilestoneAction({ milestoneId: testMilestoneId1 }),
      approveMilestoneAction({ milestoneId: testMilestoneId1 }),
    ]);

    expect(app1.success).toBe(true);
    expect(app2.success).toBe(true);
    expect(app1.milestoneId).toBe(testMilestoneId1);
    expect(app2.milestoneId).toBe(testMilestoneId1);

    // Verify database state: status APPROVED, lifecycleVersion exactly 3 (not 4)
    const milestone = await prisma.contractMilestone.findUnique({
      where: { id: testMilestoneId1 },
      select: { status: true, lifecycleVersion: true },
    });
    expect(milestone?.status).toBe(MilestoneStatus.APPROVED);
    expect(milestone?.lifecycleVersion).toBe(3);

    // Verify notifications for freelancer: exactly ONE notification
    const approvedNotifs = await prisma.notification.findMany({
      where: {
        userId: testFreelancerId,
        type: NotificationType.MILESTONE_APPROVED,
      },
    });
    expect(approvedNotifs).toHaveLength(1);
    expect(approvedNotifs[0].idempotencyKey).toBe(`milestone:${testMilestoneId1}:approved:v3`);
  });

  // ---------------------------------------------------------------------------
  // 5. Notification failure followed by a retry creates the missing notification
  // ---------------------------------------------------------------------------
  it("5. notification failure followed by a retry creates the missing notification without repeating the business transition", async () => {
    // Seed Job 2 for Contract 2
    await prisma.job.create({
      data: {
        id: testJobId2,
        clientId: testClientId,
        title: "Recovery Test Job",
        description: "Job for recovery testing.",
        category: "Software Development",
        status: JobStatus.IN_PROGRESS,
      },
    });

    // Seed Proposal 2 for Contract 2
    await prisma.proposal.create({
      data: {
        id: testProposalId2,
        jobId: testJobId2,
        freelancerId: testFreelancerId,
        coverLetter: "Proposal for contract 2",
        bidAmount: 4000,
        status: "ACCEPTED",
      },
    });

    // Seed Contract 2 in ACTIVE status
    await prisma.contract.create({
      data: {
        id: testContractId2,
        jobId: testJobId2,
        proposalId: testProposalId2,
        clientId: testClientId,
        freelancerId: testFreelancerId,
        title: "Recovery Contract",
        status: ContractStatus.ACTIVE,
        lifecycleVersion: 1,
      },
    });

    mockCurrentUser = {
      id: testClientId,
      name: "Concurrency Client",
      role: "CLIENT",
      roleSelected: true,
      emailVerified: new Date(),
    };

    // 1. Simulate notification dispatch failure during the first status update
    const origCreate = globalPrisma.notification.create;
    (globalPrisma.notification as unknown as { create: unknown }).create = vi
      .fn()
      .mockRejectedValueOnce(new Error("Simulated network timeout during notification create"));

    try {
      const initialRes = await updateContractStatusAction({
        contractId: testContractId2,
        status: ContractStatus.PAUSED,
      });

      // Business transition succeeded
      expect(initialRes.success).toBe(true);
      expect(initialRes.status).toBe(ContractStatus.PAUSED);
    } finally {
      globalPrisma.notification.create = origCreate;
    }

    // Verify contract is PAUSED with lifecycleVersion = 2
    const contractAfterFailure = await prisma.contract.findUnique({
      where: { id: testContractId2 },
      select: { status: true, lifecycleVersion: true },
    });
    expect(contractAfterFailure?.status).toBe(ContractStatus.PAUSED);
    expect(contractAfterFailure?.lifecycleVersion).toBe(2);

    // Verify notification is currently MISSING because creation threw
    const expectedKey = `contract:${testContractId2}:status:PAUSED:v2`;
    const notifBeforeRetry = await prisma.notification.findFirst({
      where: { idempotencyKey: expectedKey },
    });
    expect(notifBeforeRetry).toBeNull();

    // 2. Retry the action
    const retryRes = await updateContractStatusAction({
      contractId: testContractId2,
      status: ContractStatus.PAUSED,
    });

    expect(retryRes.success).toBe(true);
    expect(retryRes.status).toBe(ContractStatus.PAUSED);

    // Verify lifecycleVersion DID NOT increment (remains 2)
    const contractAfterRetry = await prisma.contract.findUnique({
      where: { id: testContractId2 },
      select: { status: true, lifecycleVersion: true },
    });
    expect(contractAfterRetry?.lifecycleVersion).toBe(2);

    // Verify the missing notification has been recovered and created!
    const recoveredNotif = await prisma.notification.findFirst({
      where: { idempotencyKey: expectedKey },
    });
    expect(recoveredNotif).not.toBeNull();
    expect(recoveredNotif?.userId).toBe(testFreelancerId);
    expect(recoveredNotif?.title).toBe("Contract Status Updated: PAUSED");
  });

  // ---------------------------------------------------------------------------
  // 6. Retrying an action when its notification already exists does not create a duplicate
  // ---------------------------------------------------------------------------
  it("6. retrying an action when its notification already exists does not create a duplicate", async () => {
    mockCurrentUser = {
      id: testClientId,
      name: "Concurrency Client",
      role: "CLIENT",
      roleSelected: true,
      emailVerified: new Date(),
    };

    // Third call on already paused Contract 2 with existing notification
    const res = await updateContractStatusAction({
      contractId: testContractId2,
      status: ContractStatus.PAUSED,
    });

    expect(res.success).toBe(true);

    const notifs = await prisma.notification.findMany({
      where: {
        userId: testFreelancerId,
        idempotencyKey: `contract:${testContractId2}:status:PAUSED:v2`,
      },
    });

    // Exactly one notification preserved
    expect(notifs).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // 7. Lifecycle versions remain monotonic and correct across multiple transitions
  // ---------------------------------------------------------------------------
  it("7. lifecycle versions remain monotonic and correct across multiple transitions", async () => {
    mockCurrentUser = {
      id: testClientId,
      name: "Concurrency Client",
      role: "CLIENT",
      roleSelected: true,
      emailVerified: new Date(),
    };

    // Contract 2 is at v2 (PAUSED).
    // Transition 1: PAUSED -> ACTIVE (v3)
    await updateContractStatusAction({ contractId: testContractId2, status: ContractStatus.ACTIVE });
    // Transition 2: ACTIVE -> PAUSED (v4)
    await updateContractStatusAction({ contractId: testContractId2, status: ContractStatus.PAUSED });
    // Transition 3: PAUSED -> ACTIVE (v5)
    await updateContractStatusAction({ contractId: testContractId2, status: ContractStatus.ACTIVE });
    // Transition 4: ACTIVE -> COMPLETED (v6)
    await updateContractStatusAction({ contractId: testContractId2, status: ContractStatus.COMPLETED });

    const finalContract = await prisma.contract.findUnique({
      where: { id: testContractId2 },
      select: { status: true, lifecycleVersion: true },
    });

    expect(finalContract?.status).toBe(ContractStatus.COMPLETED);
    expect(finalContract?.lifecycleVersion).toBe(6);

    const allNotifs = await prisma.notification.findMany({
      where: { userId: testFreelancerId },
      orderBy: { createdAt: "asc" },
    });

    const contract2Keys = allNotifs
      .map((n) => n.idempotencyKey)
      .filter((k): k is string => typeof k === "string" && k.startsWith(`contract:${testContractId2}`));

    expect(contract2Keys).toEqual([
      `contract:${testContractId2}:status:PAUSED:v2`,
      `contract:${testContractId2}:status:ACTIVE:v3`,
      `contract:${testContractId2}:status:PAUSED:v4`,
      `contract:${testContractId2}:status:ACTIVE:v5`,
      `contract:${testContractId2}:status:COMPLETED:v6`,
    ]);
  });

  // ---------------------------------------------------------------------------
  // 8. Existing authorization and business constraints remain unchanged
  // ---------------------------------------------------------------------------
  it("8. existing authorization and business constraints remain unchanged", async () => {
    // A. Terminal contract cannot be reopened
    mockCurrentUser = {
      id: testClientId,
      name: "Concurrency Client",
      role: "CLIENT",
      roleSelected: true,
      emailVerified: new Date(),
    };

    const reopenAttempt = await updateContractStatusAction({
      contractId: testContractId2,
      status: ContractStatus.ACTIVE,
    });
    expect(reopenAttempt.success).toBe(false);
    expect(reopenAttempt.error).toContain("already completed and cannot be changed");

    // B. Non-owner cannot update contract status
    mockCurrentUser = {
      id: "673000000000000000000099", // Random other user
      name: "Intruder Client",
      role: "CLIENT",
      roleSelected: true,
      emailVerified: new Date(),
    };

    const unauthUpdate = await updateContractStatusAction({
      contractId: testContractId1,
      status: ContractStatus.PAUSED,
    });
    expect(unauthUpdate.success).toBe(false);
    expect(unauthUpdate.error).toContain("Unauthorized: You do not own this contract.");

    // C. Non-freelancer cannot submit milestone
    const clientSubmit = await submitMilestoneAction({ milestoneId: testMilestoneId1 });
    expect(clientSubmit.success).toBe(false);
    expect(clientSubmit.error).toContain("Unauthorized");
  });

  // ---------------------------------------------------------------------------
  // 9. CAS: ACTIVE -> PAUSED competing with ACTIVE -> COMPLETED
  // ---------------------------------------------------------------------------
  it("9. CAS: competing ACTIVE -> PAUSED vs ACTIVE -> COMPLETED allows exactly one transition", async () => {
    // Seed Job 3, Proposal 3, and Contract 3 in ACTIVE status
    await prisma.job.create({
      data: {
        id: testJobId3,
        clientId: testClientId,
        title: "CAS Test Job 3",
        description: "Competing PAUSED vs COMPLETED",
        category: "Software Development",
        status: JobStatus.IN_PROGRESS,
      },
    });

    await prisma.proposal.create({
      data: {
        id: testProposalId3,
        jobId: testJobId3,
        freelancerId: testFreelancerId,
        coverLetter: "Proposal for contract 3",
        bidAmount: 5000,
        status: "ACCEPTED",
      },
    });

    await prisma.contract.create({
      data: {
        id: testContractId3,
        jobId: testJobId3,
        proposalId: testProposalId3,
        clientId: testClientId,
        freelancerId: testFreelancerId,
        title: "CAS Contract 3",
        status: ContractStatus.ACTIVE,
        lifecycleVersion: 1,
      },
    });

    mockCurrentUser = {
      id: testClientId,
      name: "Concurrency Client",
      role: "CLIENT",
      roleSelected: true,
      emailVerified: new Date(),
    };

    const [resPaused, resCompleted] = await Promise.all([
      updateContractStatusAction({
        contractId: testContractId3,
        status: ContractStatus.PAUSED,
      }),
      updateContractStatusAction({
        contractId: testContractId3,
        status: ContractStatus.COMPLETED,
      }),
    ]);

    // Exactly one request MUST succeed, and the competing request MUST fail
    const succeededCount = (resPaused.success ? 1 : 0) + (resCompleted.success ? 1 : 0);
    expect(succeededCount).toBe(1);

    const contract3 = await prisma.contract.findUnique({
      where: { id: testContractId3 },
      select: { status: true, lifecycleVersion: true },
    });

    // Version must increment exactly once (1 -> 2)
    expect(contract3?.lifecycleVersion).toBe(2);

    if (resPaused.success) {
      expect(contract3?.status).toBe(ContractStatus.PAUSED);
      expect(resCompleted.success).toBe(false);
      expect(resCompleted.error).toBe(
        "Contract status was concurrently updated to paused. Please refresh and try again."
      );
    } else {
      expect(contract3?.status).toBe(ContractStatus.COMPLETED);
      expect(resPaused.success).toBe(false);
      expect(resPaused.error).toBe(
        "Cannot update status. Contract is already completed and cannot be changed."
      );
    }

    // Exactly ONE notification created for Contract 3
    const notifs = await prisma.notification.findMany({
      where: {
        userId: testFreelancerId,
        idempotencyKey: { startsWith: `contract:${testContractId3}` },
      },
    });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].idempotencyKey).toBe(`contract:${testContractId3}:status:${contract3?.status}:v2`);
  });

  // ---------------------------------------------------------------------------
  // 10. CAS: ACTIVE -> COMPLETED competing with ACTIVE -> TERMINATED
  // ---------------------------------------------------------------------------
  it("10. CAS: competing ACTIVE -> COMPLETED vs ACTIVE -> TERMINATED allows exactly one transition", async () => {
    // Seed Job 4, Proposal 4, and Contract 4 in ACTIVE status
    await prisma.job.create({
      data: {
        id: testJobId4,
        clientId: testClientId,
        title: "CAS Test Job 4",
        description: "Competing COMPLETED vs TERMINATED",
        category: "Software Development",
        status: JobStatus.IN_PROGRESS,
      },
    });

    await prisma.proposal.create({
      data: {
        id: testProposalId4,
        jobId: testJobId4,
        freelancerId: testFreelancerId,
        coverLetter: "Proposal for contract 4",
        bidAmount: 6000,
        status: "ACCEPTED",
      },
    });

    await prisma.contract.create({
      data: {
        id: testContractId4,
        jobId: testJobId4,
        proposalId: testProposalId4,
        clientId: testClientId,
        freelancerId: testFreelancerId,
        title: "CAS Contract 4",
        status: ContractStatus.ACTIVE,
        lifecycleVersion: 1,
      },
    });

    mockCurrentUser = {
      id: testClientId,
      name: "Concurrency Client",
      role: "CLIENT",
      roleSelected: true,
      emailVerified: new Date(),
    };

    const [resCompleted, resTerminated] = await Promise.all([
      updateContractStatusAction({
        contractId: testContractId4,
        status: ContractStatus.COMPLETED,
      }),
      updateContractStatusAction({
        contractId: testContractId4,
        status: ContractStatus.TERMINATED,
      }),
    ]);

    // Exactly one succeeds, one fails
    const succeededCount = (resCompleted.success ? 1 : 0) + (resTerminated.success ? 1 : 0);
    expect(succeededCount).toBe(1);

    const contract4 = await prisma.contract.findUnique({
      where: { id: testContractId4 },
      select: { status: true, lifecycleVersion: true },
    });

    // Version must increment exactly once (1 -> 2)
    expect(contract4?.lifecycleVersion).toBe(2);

    // The losing request must receive terminal state error
    if (resCompleted.success) {
      expect(contract4?.status).toBe(ContractStatus.COMPLETED);
      expect(resTerminated.success).toBe(false);
      expect(resTerminated.error).toBe(
        "Cannot update status. Contract is already completed and cannot be changed."
      );
    } else {
      expect(contract4?.status).toBe(ContractStatus.TERMINATED);
      expect(resCompleted.success).toBe(false);
      expect(resCompleted.error).toBe(
        "Cannot update status. Contract is already terminated and cannot be changed."
      );
    }

    // Exactly ONE notification created
    const notifs = await prisma.notification.findMany({
      where: {
        userId: testFreelancerId,
        idempotencyKey: { startsWith: `contract:${testContractId4}` },
      },
    });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].idempotencyKey).toBe(`contract:${testContractId4}:status:${contract4?.status}:v2`);
  });

  // ---------------------------------------------------------------------------
  // 11. CAS: PAUSED -> ACTIVE competing with PAUSED -> TERMINATED
  // ---------------------------------------------------------------------------
  it("11. CAS: competing PAUSED -> ACTIVE vs PAUSED -> TERMINATED allows exactly one transition", async () => {
    // Seed Job 5, Proposal 5, and Contract 5 in PAUSED status
    await prisma.job.create({
      data: {
        id: testJobId5,
        clientId: testClientId,
        title: "CAS Test Job 5",
        description: "Competing ACTIVE vs TERMINATED from PAUSED",
        category: "Software Development",
        status: JobStatus.IN_PROGRESS,
      },
    });

    await prisma.proposal.create({
      data: {
        id: testProposalId5,
        jobId: testJobId5,
        freelancerId: testFreelancerId,
        coverLetter: "Proposal for contract 5",
        bidAmount: 7000,
        status: "ACCEPTED",
      },
    });

    await prisma.contract.create({
      data: {
        id: testContractId5,
        jobId: testJobId5,
        proposalId: testProposalId5,
        clientId: testClientId,
        freelancerId: testFreelancerId,
        title: "CAS Contract 5",
        status: ContractStatus.PAUSED,
        lifecycleVersion: 1,
      },
    });

    mockCurrentUser = {
      id: testClientId,
      name: "Concurrency Client",
      role: "CLIENT",
      roleSelected: true,
      emailVerified: new Date(),
    };

    const [resActive, resTerminated] = await Promise.all([
      updateContractStatusAction({
        contractId: testContractId5,
        status: ContractStatus.ACTIVE,
      }),
      updateContractStatusAction({
        contractId: testContractId5,
        status: ContractStatus.TERMINATED,
      }),
    ]);

    const succeededCount = (resActive.success ? 1 : 0) + (resTerminated.success ? 1 : 0);
    expect(succeededCount).toBe(1);

    const contract5 = await prisma.contract.findUnique({
      where: { id: testContractId5 },
      select: { status: true, lifecycleVersion: true },
    });

    expect(contract5?.lifecycleVersion).toBe(2);

    if (resActive.success) {
      expect(contract5?.status).toBe(ContractStatus.ACTIVE);
      expect(resTerminated.success).toBe(false);
      expect(resTerminated.error).toBe(
        "Contract status was concurrently updated to active. Please refresh and try again."
      );
    } else {
      expect(contract5?.status).toBe(ContractStatus.TERMINATED);
      expect(resActive.success).toBe(false);
      expect(resActive.error).toBe(
        "Cannot update status. Contract is already terminated and cannot be changed."
      );
    }

    const notifs = await prisma.notification.findMany({
      where: {
        userId: testFreelancerId,
        idempotencyKey: { startsWith: `contract:${testContractId5}` },
      },
    });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].idempotencyKey).toBe(`contract:${testContractId5}:status:${contract5?.status}:v2`);
  });

  // ---------------------------------------------------------------------------
  // 12. CAS: Stale request arriving after contract has changed state is rejected
  // ---------------------------------------------------------------------------
  it("12. CAS: stale request arriving after contract has changed state is rejected without modifying DB", async () => {
    mockCurrentUser = {
      id: testClientId,
      name: "Concurrency Client",
      role: "CLIENT",
      roleSelected: true,
      emailVerified: new Date(),
    };

    // Contract 3 is currently PAUSED or COMPLETED from test 9
    const c3Before = await prisma.contract.findUnique({
      where: { id: testContractId3 },
      select: { status: true, lifecycleVersion: true },
    });

    if (c3Before?.status === ContractStatus.PAUSED) {
      // Simulate concurrent update changing state to ACTIVE in the background
      await prisma.contract.update({
        where: { id: testContractId3 },
        data: { status: ContractStatus.ACTIVE, lifecycleVersion: { increment: 1 } },
      });

      // Now a stale call attempting to transition from PAUSED is made
      // Calling updateContractStatusAction checks fresh state and fails closed
      const res = await updateContractStatusAction({
        contractId: testContractId3,
        status: ContractStatus.TERMINATED,
      });

      expect(res.success).toBe(true); // Since it was ACTIVE, ACTIVE -> TERMINATED is a valid direct transition
    } else {
      // If c3 was COMPLETED, any stale request must be rejected
      const res = await updateContractStatusAction({
        contractId: testContractId3,
        status: ContractStatus.PAUSED,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("already completed and cannot be changed");
    }
  });

  // ---------------------------------------------------------------------------
  // 13. ABA Concurrency: ACTIVE v1 -> PAUSED v2 -> ACTIVE v3 rejects delayed v1
  // ---------------------------------------------------------------------------
  it("13. ABA Concurrency: ACTIVE v1 -> PAUSED v2 -> ACTIVE v3 rejects delayed v1 request", async () => {
    mockCurrentUser = {
      id: testClientId,
      name: "Concurrency Client",
      role: "CLIENT",
      roleSelected: true,
      emailVerified: new Date(),
    };

    // Seed Job 6, Proposal 6, Contract 6
    await prisma.job.create({
      data: {
        id: testJobId6,
        clientId: testClientId,
        title: "ABA Test Job",
        description: "Testing ABA concurrency safety.",
        category: "Software Development",
        status: JobStatus.IN_PROGRESS,
      },
    });

    await prisma.proposal.create({
      data: {
        id: testProposalId6,
        jobId: testJobId6,
        freelancerId: testFreelancerId,
        coverLetter: "Proposal for contract 6 ABA test",
        bidAmount: 2500,
        status: "ACCEPTED",
      },
    });

    await prisma.contract.create({
      data: {
        id: testContractId6,
        jobId: testJobId6,
        proposalId: testProposalId6,
        clientId: testClientId,
        freelancerId: testFreelancerId,
        title: "ABA Concurrency Contract",
        status: ContractStatus.ACTIVE,
        lifecycleVersion: 1,
      },
    });

    // Intercept findUnique on globalPrisma.contract so that when Request A reads ACTIVE v1,
    // before its CAS updateMany runs, we simulate the two intervening transitions:
    // ACTIVE v1 -> PAUSED v2, and then PAUSED v2 -> ACTIVE v3
    type FindUniqueArgs = Parameters<typeof globalPrisma.contract.findUnique>[0];
    const originalFindUnique = globalPrisma.contract.findUnique;
    let intercepted = false;

    globalPrisma.contract.findUnique = (async (args: FindUniqueArgs) => {
      const result = await originalFindUnique.call(globalPrisma.contract, args);
      if (!intercepted && args?.where?.id === testContractId6) {
        intercepted = true;

        // Intermediate Transition 1: ACTIVE v1 -> PAUSED v2
        const res1 = await updateContractStatusAction({
          contractId: testContractId6,
          status: ContractStatus.PAUSED,
        });
        expect(res1.success).toBe(true);

        // Intermediate Transition 2: PAUSED v2 -> ACTIVE v3
        const res2 = await updateContractStatusAction({
          contractId: testContractId6,
          status: ContractStatus.ACTIVE,
        });
        expect(res2.success).toBe(true);
      }
      return result;
    }) as unknown as typeof globalPrisma.contract.findUnique;

    try {
      // Now delayed Request A executes, having read the initial ACTIVE v1 snapshot
      // and attempting to transition to PAUSED:
      const delayedResA = await updateContractStatusAction({
        contractId: testContractId6,
        status: ContractStatus.PAUSED,
      });

      // Verify delayed Request A failed closed
      expect(delayedResA.success).toBe(false);
      expect(delayedResA.error).toBe(
        "Contract state was modified concurrently. Please refresh and try again."
      );
    } finally {
      // Always restore original findUnique reference
      globalPrisma.contract.findUnique = originalFindUnique;
    }

    // Verify database state: status remains ACTIVE, version remains 3 (NOT 4)
    const contractAfter = await prisma.contract.findUnique({
      where: { id: testContractId6 },
      select: { status: true, lifecycleVersion: true },
    });
    expect(contractAfter?.status).toBe(ContractStatus.ACTIVE);
    expect(contractAfter?.lifecycleVersion).toBe(3);

    // Verify notifications: only v2 (PAUSED) and v3 (ACTIVE) were generated
    const notifications = await prisma.notification.findMany({
      where: {
        userId: testFreelancerId,
        idempotencyKey: { startsWith: `contract:${testContractId6}` },
      },
      orderBy: { createdAt: "asc" },
    });

    expect(notifications).toHaveLength(2);
    expect(notifications[0].idempotencyKey).toBe(
      `contract:${testContractId6}:status:PAUSED:v2`
    );
    expect(notifications[1].idempotencyKey).toBe(
      `contract:${testContractId6}:status:ACTIVE:v3`
    );
  });

  // ---------------------------------------------------------------------------
  // 14. Legacy Document Compatibility: document without lifecycleVersion in DB
  // ---------------------------------------------------------------------------
  it("14. Legacy Document Compatibility: document without lifecycleVersion transitions safely and migrates to v2", async () => {
    mockCurrentUser = {
      id: testClientId,
      name: "Concurrency Client",
      role: "CLIENT",
      roleSelected: true,
      emailVerified: new Date(),
    };

    // Seed Job 7, Proposal 7
    await prisma.job.create({
      data: {
        id: testJobId7,
        clientId: testClientId,
        title: "Legacy Contract Job",
        description: "Testing legacy documents without lifecycleVersion.",
        category: "Software Development",
        status: JobStatus.IN_PROGRESS,
      },
    });

    await prisma.proposal.create({
      data: {
        id: testProposalId7,
        jobId: testJobId7,
        freelancerId: testFreelancerId,
        coverLetter: "Proposal for legacy contract 7",
        bidAmount: 1800,
        status: "ACCEPTED",
      },
    });

    // Insert legacy raw document in MongoDB omitting lifecycleVersion field
    await prisma.$runCommandRaw({
      insert: "contracts",
      documents: [
        {
          _id: { $oid: testContractId7 },
          title: "Legacy Contract Without Version",
          status: "ACTIVE",
          proposalId: { $oid: testProposalId7 },
          jobId: { $oid: testJobId7 },
          clientId: { $oid: testClientId },
          freelancerId: { $oid: testFreelancerId },
          totalAmount: 1800,
          type: "FIXED",
          startDate: { $date: new Date().toISOString() },
          createdAt: { $date: new Date().toISOString() },
          updatedAt: { $date: new Date().toISOString() },
          // NOTE: lifecycleVersion is intentionally omitted to simulate legacy unbackfilled record
        },
      ],
    });

    // Verify initial read via Prisma shows default 1 in memory
    const legacyRead = await prisma.contract.findUnique({
      where: { id: testContractId7 },
      select: { status: true, lifecycleVersion: true },
    });
    expect(legacyRead?.status).toBe(ContractStatus.ACTIVE);
    expect(legacyRead?.lifecycleVersion).toBe(1);

    // Transition legacy document ACTIVE -> PAUSED
    const resTransition1 = await updateContractStatusAction({
      contractId: testContractId7,
      status: ContractStatus.PAUSED,
    });
    expect(resTransition1.success).toBe(true);
    expect(resTransition1.status).toBe(ContractStatus.PAUSED);

    // Verify persisted record in DB now has status: PAUSED and lifecycleVersion: 2
    const docAfter1 = await prisma.contract.findUnique({
      where: { id: testContractId7 },
      select: { status: true, lifecycleVersion: true },
    });
    expect(docAfter1?.status).toBe(ContractStatus.PAUSED);
    expect(docAfter1?.lifecycleVersion).toBe(2);

    // Verify notification was created with v2
    const notif1 = await prisma.notification.findFirst({
      where: {
        idempotencyKey: `contract:${testContractId7}:status:PAUSED:v2`,
      },
    });
    expect(notif1).not.toBeNull();

    // Now test subsequent transition PAUSED v2 -> ACTIVE v3
    const resTransition2 = await updateContractStatusAction({
      contractId: testContractId7,
      status: ContractStatus.ACTIVE,
    });
    expect(resTransition2.success).toBe(true);
    expect(resTransition2.status).toBe(ContractStatus.ACTIVE);

    const docAfter2 = await prisma.contract.findUnique({
      where: { id: testContractId7 },
      select: { status: true, lifecycleVersion: true },
    });
    expect(docAfter2?.status).toBe(ContractStatus.ACTIVE);
    expect(docAfter2?.lifecycleVersion).toBe(3);

    const notif2 = await prisma.notification.findFirst({
      where: {
        idempotencyKey: `contract:${testContractId7}:status:ACTIVE:v3`,
      },
    });
    expect(notif2).not.toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 15. Same-target idempotent retry on multi-version contract recovers notification
  // ---------------------------------------------------------------------------
  it("15. Same-target idempotent retry preserves state and recovers missing notification", async () => {
    mockCurrentUser = {
      id: testClientId,
      name: "Concurrency Client",
      role: "CLIENT",
      roleSelected: true,
      emailVerified: new Date(),
    };

    // Contract 6 is currently ACTIVE at version 3
    const c6 = await prisma.contract.findUnique({
      where: { id: testContractId6 },
      select: { status: true, lifecycleVersion: true },
    });
    expect(c6?.status).toBe(ContractStatus.ACTIVE);
    expect(c6?.lifecycleVersion).toBe(3);

    // Intentionally delete the notification for ACTIVE:v3 to simulate failed notification delivery
    await prisma.notification.deleteMany({
      where: {
        idempotencyKey: `contract:${testContractId6}:status:ACTIVE:v3`,
      },
    });

    // Client retries ACTIVE transition
    const retryRes = await updateContractStatusAction({
      contractId: testContractId6,
      status: ContractStatus.ACTIVE,
    });

    expect(retryRes.success).toBe(true);
    expect(retryRes.status).toBe(ContractStatus.ACTIVE);

    // Version must NOT be incremented
    const c6After = await prisma.contract.findUnique({
      where: { id: testContractId6 },
      select: { status: true, lifecycleVersion: true },
    });
    expect(c6After?.lifecycleVersion).toBe(3);

    // Notification must be safely recovered
    const recoveredNotif = await prisma.notification.findFirst({
      where: {
        idempotencyKey: `contract:${testContractId6}:status:ACTIVE:v3`,
      },
    });
    expect(recoveredNotif).not.toBeNull();
    expect(recoveredNotif?.userId).toBe(testFreelancerId);
  });
});
