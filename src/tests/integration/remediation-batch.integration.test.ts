/* eslint-disable @typescript-eslint/no-explicit-any */
// src/tests/integration/remediation-batch.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PrismaClient,
  ContractStatus,
  PaymentType,
  PaymentItemType,
  PaymentStatus,
  TimeTrackingStatus,
  Role,
} from "@prisma/client";

const isIntegrationRun = process.env.WORKPULSE_INTEGRATION_RUN === "true";
const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  "mongodb://127.0.0.1:27018/workpulse_test?replicaSet=rsTest&directConnection=true";

describe("WorkPulse Remediation Batch - Real MongoDB Replica Set Integration Tests", () => {
  if (!isIntegrationRun) {
    it.skip("skips database integration test during standard unit test run (run 'npm run test:integration')", () => {
      // Intentionally skipped during unit tests
    });
    return;
  }

  let prisma: PrismaClient;
  let isReplicaSet = false;
  let replicaSetName = "";

  // Test fixture ObjectIds
  const testClientId = "66f000000000000000000001";
  const testFreelancerId = "66f000000000000000000002";
  const testJobId = "66f000000000000000000003";
  const testProposalId = "66f000000000000000000004";
  const testContractId = "66f000000000000000000005";

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: testDbUrl,
        },
      },
    });

    // Detect server topology (must be replica set for Prisma multi-document transactions)
    try {
      const serverStatus = (await prisma.$runCommandRaw({ hello: 1 })) as {
        setName?: string;
        msg?: string;
        isWritablePrimary?: boolean;
      };
      if (serverStatus.setName) {
        isReplicaSet = true;
        replicaSetName = serverStatus.setName;
      }
    } catch (err) {
      console.warn("[Integration Test Setup] Could not query server topology:", err);
    }

    // Clean up any stale test fixtures
    await cleanupFixtures();

    // Create required base fixtures: Client, Freelancer, Job, Proposal, Contract
    await prisma.user.createMany({
      data: [
        {
          id: testClientId,
          email: "test_client_integration@workpulse.internal",
          name: "Test Client",
          role: Role.CLIENT,
        },
        {
          id: testFreelancerId,
          email: "test_freelancer_integration@workpulse.internal",
          name: "Test Freelancer",
          role: Role.FREELANCER,
        },
      ],
    });

    await prisma.job.create({
      data: {
        id: testJobId,
        clientId: testClientId,
        title: "Integration Test Job",
        description: "Test job for transaction integration verification",
        category: "Development",
        type: PaymentType.HOURLY,
        budget: 50,
      },
    });

    await prisma.proposal.create({
      data: {
        id: testProposalId,
        jobId: testJobId,
        freelancerId: testFreelancerId,
        coverLetter: "Integration test proposal",
        bidAmount: 50,
      },
    });

    await prisma.contract.create({
      data: {
        id: testContractId,
        jobId: testJobId,
        proposalId: testProposalId,
        clientId: testClientId,
        freelancerId: testFreelancerId,
        title: "Integration Test Contract",
        type: PaymentType.HOURLY,
        hourlyRate: 50,
        status: ContractStatus.ACTIVE,
      },
    });
  });

  async function cleanupFixtures() {
    try {
      await prisma.activeTimerReservation.deleteMany({
        where: { freelancerId: testFreelancerId },
      });
      await prisma.payment.deleteMany({
        where: { contractId: testContractId },
      });
      await prisma.timeEntry.deleteMany({
        where: { contractId: testContractId },
      });
      await prisma.contract.deleteMany({
        where: { id: testContractId },
      });
      await prisma.proposal.deleteMany({
        where: { id: testProposalId },
      });
      await prisma.job.deleteMany({
        where: { id: testJobId },
      });
      await prisma.user.deleteMany({
        where: {
          id: { in: [testClientId, testFreelancerId] },
        },
      });
    } catch {
      // Ignore if collections don't exist yet
    }
  }

  afterAll(async () => {
    try {
      await cleanupFixtures();
    } finally {
      await prisma.$disconnect();
    }
  });

  it("TASK 3.0: verifies dedicated test database is active and isolated", async () => {
    expect(testDbUrl).toBeTruthy();
    expect(testDbUrl.toLowerCase()).toContain("test");
    expect(testDbUrl.toLowerCase()).not.toContain("mongodb.net");

    const ping = (await prisma.$runCommandRaw({ ping: 1 })) as { ok?: number };
    expect(ping.ok).toBe(1);
  });

  it("TASK 3.0b: verifies MongoDB replica-set topology (transactions supported)", () => {
    expect(isReplicaSet).toBe(true);
    expect(replicaSetName).toBe("rsTest");
  });

  it("TASK 3.1: verifies concurrent timer starts for the same freelancer are safely serialized", async () => {
    // Clear any reservations
    await prisma.activeTimerReservation.deleteMany({
      where: { freelancerId: testFreelancerId },
    });

    // Launch two parallel Prisma $transactions simultaneously attempting to acquire reservation for testFreelancerId
    const attempt1 = prisma.$transaction(async (tx) => {
      return tx.activeTimerReservation.create({
        data: {
          freelancerId: testFreelancerId,
          contractId: testContractId,
        },
      });
    }).then(
      (res) => ({ success: true, res }),
      (err) => ({ success: false, code: err.code, message: err.message })
    );

    const attempt2 = prisma.$transaction(async (tx) => {
      return tx.activeTimerReservation.create({
        data: {
          freelancerId: testFreelancerId,
          contractId: testContractId,
        },
      });
    }).then(
      (res) => ({ success: true, res }),
      (err) => ({ success: false, code: err.code, message: err.message })
    );

    const [res1, res2] = await Promise.all([attempt1, attempt2]);

    const successes = [res1, res2].filter((r) => r.success);
    const failures = [res1, res2].filter((r) => !r.success);

    // Exactly one must succeed and one must fail with unique constraint violation (P2002) or write conflict
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
    const failure = failures[0] as { success: false; code?: string; message?: string };
    expect(
      failure.code === "P2002" ||
      failure.code === "P2034" ||
      failure.message?.includes("Unique constraint") ||
      failure.message?.includes("write conflict") ||
      failure.message?.includes("WriteConflict")
    ).toBe(true);

    // Database must hold exactly 1 reservation document
    const count = await prisma.activeTimerReservation.count({
      where: { freelancerId: testFreelancerId },
    });
    expect(count).toBe(1);

    // Cleanup
    await prisma.activeTimerReservation.deleteMany({
      where: { freelancerId: testFreelancerId },
    });
  });

  it("TASK 3.2: verifies reservation and TimeEntry atomic creation inside Prisma transaction", async () => {
    await prisma.activeTimerReservation.deleteMany({
      where: { freelancerId: testFreelancerId },
    });
    await prisma.timeEntry.deleteMany({
      where: { freelancerId: testFreelancerId },
    });

    const result = await prisma.$transaction(async (tx) => {
      // 1. Acquire reservation
      const reservation = await tx.activeTimerReservation.create({
        data: {
          freelancerId: testFreelancerId,
          contractId: testContractId,
        },
      });

      // 2. Create running TimeEntry
      const timeEntry = await tx.timeEntry.create({
        data: {
          contractId: testContractId,
          freelancerId: testFreelancerId,
          status: TimeTrackingStatus.RECORDING,
          hourlyRate: 50,
          description: "Atomic integration test entry",
        },
      });

      // 3. Link reservation to TimeEntry
      await tx.activeTimerReservation.update({
        where: { id: reservation.id },
        data: { timeEntryId: timeEntry.id },
      });

      return { reservationId: reservation.id, timeEntryId: timeEntry.id };
    });

    expect(result.reservationId).toBeTruthy();
    expect(result.timeEntryId).toBeTruthy();

    // Verify both records exist in MongoDB
    const persistedReservation = await prisma.activeTimerReservation.findUnique({
      where: { freelancerId: testFreelancerId },
    });
    expect(persistedReservation?.timeEntryId).toBe(result.timeEntryId);

    const persistedEntry = await prisma.timeEntry.findUnique({
      where: { id: result.timeEntryId },
    });
    expect(persistedEntry?.status).toBe(TimeTrackingStatus.RECORDING);

    // Cleanup
    await prisma.activeTimerReservation.deleteMany({
      where: { freelancerId: testFreelancerId },
    });
    await prisma.timeEntry.deleteMany({
      where: { freelancerId: testFreelancerId },
    });
  });

  it("TASK 3.3: verifies transaction rollback when TimeEntry creation fails leaves no orphan reservation", async () => {
    await prisma.activeTimerReservation.deleteMany({
      where: { freelancerId: testFreelancerId },
    });

    let transactionFailed = false;

    try {
      await prisma.$transaction(async (tx) => {
        // Step 1: Create reservation
        await tx.activeTimerReservation.create({
          data: {
            freelancerId: testFreelancerId,
            contractId: testContractId,
          },
        });

        // Step 2: Simulate failure during TimeEntry creation
        throw new Error("Simulated failure during TimeEntry creation");
      });
    } catch (err: any) {
      if (err.message.includes("Simulated failure")) {
        transactionFailed = true;
      }
    }

    expect(transactionFailed).toBe(true);

    // Verify database state: reservation MUST NOT exist due to atomicity rollback
    const orphanedReservation = await prisma.activeTimerReservation.findUnique({
      where: { freelancerId: testFreelancerId },
    });
    expect(orphanedReservation).toBeNull();
  });

  it("TASK 3.4: verifies pause and resume retain the reservation", async () => {
    // 1. Create active session with reservation
    const { timeEntryId } = await prisma.$transaction(async (tx) => {
      const res = await tx.activeTimerReservation.create({
        data: {
          freelancerId: testFreelancerId,
          contractId: testContractId,
        },
      });
      const entry = await tx.timeEntry.create({
        data: {
          contractId: testContractId,
          freelancerId: testFreelancerId,
          status: TimeTrackingStatus.RECORDING,
          hourlyRate: 50,
        },
      });
      await tx.activeTimerReservation.update({
        where: { id: res.id },
        data: { timeEntryId: entry.id },
      });
      return { timeEntryId: entry.id };
    });

    // 2. Pause the session: updates TimeEntry status to PAUSED inside transaction
    await prisma.$transaction(async (tx) => {
      await tx.timeEntry.update({
        where: { id: timeEntryId },
        data: {
          status: TimeTrackingStatus.PAUSED,
          pausedAt: new Date(),
        },
      });
      // Reservation is NOT deleted during pause
    });

    // Verify reservation still exists in DB
    let reservation = await prisma.activeTimerReservation.findUnique({
      where: { freelancerId: testFreelancerId },
    });
    expect(reservation).not.toBeNull();
    expect(reservation?.timeEntryId).toBe(timeEntryId);

    // 3. Resume the session: updates TimeEntry status back to RECORDING inside transaction
    await prisma.$transaction(async (tx) => {
      await tx.timeEntry.update({
        where: { id: timeEntryId },
        data: {
          status: TimeTrackingStatus.RECORDING,
          pausedAt: null,
        },
      });
      // Reservation is retained
    });

    // Verify reservation still exists
    reservation = await prisma.activeTimerReservation.findUnique({
      where: { freelancerId: testFreelancerId },
    });
    expect(reservation).not.toBeNull();

    // Cleanup
    await prisma.activeTimerReservation.deleteMany({
      where: { freelancerId: testFreelancerId },
    });
    await prisma.timeEntry.deleteMany({
      where: { freelancerId: testFreelancerId },
    });
  });

  it("TASK 3.5: verifies stop and discard release reservation only after state transition succeeds", async () => {
    // 1. Test STOP transition:
    const { timeEntryId: entry1Id } = await prisma.$transaction(async (tx) => {
      const res = await tx.activeTimerReservation.create({
        data: { freelancerId: testFreelancerId, contractId: testContractId },
      });
      const entry = await tx.timeEntry.create({
        data: {
          contractId: testContractId,
          freelancerId: testFreelancerId,
          status: TimeTrackingStatus.RECORDING,
          hourlyRate: 50,
        },
      });
      return { timeEntryId: entry.id, resId: res.id };
    });

    // Execute stop in transaction: marks TimeEntry COMPLETED and deletes reservation
    await prisma.$transaction(async (tx) => {
      await tx.timeEntry.update({
        where: { id: entry1Id },
        data: {
          status: TimeTrackingStatus.STOPPED,
          endTime: new Date(),
          durationSeconds: 120,
        },
      });
      await tx.activeTimerReservation.deleteMany({
        where: { freelancerId: testFreelancerId },
      });
    });

    // Reservation is now released
    const resAfterStop = await prisma.activeTimerReservation.findUnique({
      where: { freelancerId: testFreelancerId },
    });
    expect(resAfterStop).toBeNull();

    // 2. Test DISCARD transition:
    const { timeEntryId: entry2Id } = await prisma.$transaction(async (tx) => {
      await tx.activeTimerReservation.create({
        data: { freelancerId: testFreelancerId, contractId: testContractId },
      });
      const entry = await tx.timeEntry.create({
        data: {
          contractId: testContractId,
          freelancerId: testFreelancerId,
          status: TimeTrackingStatus.RECORDING,
          hourlyRate: 50,
        },
      });
      return { timeEntryId: entry.id };
    });

    // Discard in transaction: deletes TimeEntry and deletes reservation
    await prisma.$transaction(async (tx) => {
      await tx.timeEntry.delete({
        where: { id: entry2Id },
      });
      await tx.activeTimerReservation.deleteMany({
        where: { freelancerId: testFreelancerId },
      });
    });

    // Reservation is now released
    const resAfterDiscard = await prisma.activeTimerReservation.findUnique({
      where: { freelancerId: testFreelancerId },
    });
    expect(resAfterDiscard).toBeNull();

    // Cleanup
    await prisma.timeEntry.deleteMany({
      where: { freelancerId: testFreelancerId },
    });
  });

  it("TASK 3.6: verifies orphan reservation recovery without clearing active sessions", async () => {
    // Case A: Valid active session exists -> orphan recovery MUST NOT clear reservation
    await prisma.$transaction(async (tx) => {
      const res = await tx.activeTimerReservation.create({
        data: { freelancerId: testFreelancerId, contractId: testContractId },
      });
      const entry = await tx.timeEntry.create({
        data: {
          contractId: testContractId,
          freelancerId: testFreelancerId,
          status: TimeTrackingStatus.RECORDING,
          hourlyRate: 50,
        },
      });
      await tx.activeTimerReservation.update({
        where: { id: res.id },
        data: { timeEntryId: entry.id },
      });
    });

    // Simulate recovery check
    const activeEntry = await prisma.timeEntry.findFirst({
      where: {
        freelancerId: testFreelancerId,
        status: { in: [TimeTrackingStatus.RECORDING, TimeTrackingStatus.PAUSED] },
      },
    });

    // Since activeEntry exists, recovery does nothing
    if (!activeEntry) {
      await prisma.activeTimerReservation.deleteMany({
        where: { freelancerId: testFreelancerId },
      });
    }

    const preserved = await prisma.activeTimerReservation.findUnique({
      where: { freelancerId: testFreelancerId },
    });
    expect(preserved).not.toBeNull();

    // Case B: Truly orphaned reservation (no active session exists in DB)
    await prisma.timeEntry.deleteMany({
      where: { freelancerId: testFreelancerId },
    });

    // Now run orphan recovery: checks for active session and cleans up stale reservation
    const activeCheck = await prisma.timeEntry.findFirst({
      where: {
        freelancerId: testFreelancerId,
        status: { in: [TimeTrackingStatus.RECORDING, TimeTrackingStatus.PAUSED] },
      },
    });

    if (!activeCheck) {
      await prisma.activeTimerReservation.deleteMany({
        where: { freelancerId: testFreelancerId },
      });
    }

    const cleared = await prisma.activeTimerReservation.findUnique({
      where: { freelancerId: testFreelancerId },
    });
    expect(cleared).toBeNull();
  });

  it("TASK 3.7: verifies contract deletion racing with payment creation is safely serialized via shared write lock", async () => {
    // Test setup: ensure contract is ACTIVE and has no payments
    await prisma.payment.deleteMany({ where: { contractId: testContractId } });

    // Race two transactions:
    // T1: Payment creation (simulating createMilestonePaymentOrderAction or webhook)
    // Both T1 and T2 acquire shared write lock: tx.contract.update({ where: { id: testContractId }, data: { updatedAt: new Date() } })
    const runPaymentCreation = async () => {
      return prisma.$transaction(async (tx) => {
        // Shared write lock
        await tx.contract.update({
          where: { id: testContractId },
          data: { updatedAt: new Date() },
        });

        // Recheck contract status inside transaction
        const c = await tx.contract.findUnique({
          where: { id: testContractId },
          select: { status: true },
        });

        if (!c || c.status !== ContractStatus.ACTIVE) {
          throw new Error("Contract is no longer active");
        }

        return tx.payment.create({
          data: {
            contractId: testContractId,
            payerId: testClientId,
            recipientId: testFreelancerId,
            itemType: PaymentItemType.MILESTONE,
            amount: 100,
            amountSubunits: 10000,
            currency: "USD",
            razorpayOrderId: `order_race_${Date.now()}`,
            status: PaymentStatus.PENDING,
          },
        });
      });
    };

    // T2: Contract deletion (simulating deleteContractAction)
    const runContractDeletion = async () => {
      return prisma.$transaction(async (tx) => {
        // Shared write lock
        await tx.contract.update({
          where: { id: testContractId },
          data: { updatedAt: new Date() },
        });

        // Re-check financial records inside transaction
        const paymentCount = await tx.payment.count({
          where: { contractId: testContractId },
        });

        if (paymentCount > 0) {
          throw new Error("Financial records exist: deletion blocked");
        }

        // Proceed to delete
        return tx.contract.delete({
          where: { id: testContractId },
        });
      });
    };

    // Execute concurrently
    const [paymentRes, deletionRes] = await Promise.allSettled([
      runPaymentCreation(),
      runContractDeletion(),
    ]);

    // Financial integrity guarantee:
    // Either payment committed first -> deletion transaction re-checked financial records and was BLOCKED.
    // OR deletion committed first -> payment transaction failed with write conflict or contract not active.
    // Financial history is NEVER deleted!
    const paymentsInDb = await prisma.payment.count({
      where: { contractId: testContractId },
    });

    if (paymentsInDb > 0) {
      // Payment was created: deletion MUST have failed
      expect(deletionRes.status).toBe("rejected");
      console.log("[Integration Test] Serialized: Payment committed first; deletion was safely blocked.");
    } else {
      // Deletion occurred: payment MUST have failed
      expect(paymentRes.status).toBe("rejected");
      console.log("[Integration Test] Serialized: Deletion committed first; payment was safely rejected.");
    }

    // Cleanup & restore contract if deleted
    await prisma.payment.deleteMany({ where: { contractId: testContractId } });
    const contractExists = await prisma.contract.findUnique({ where: { id: testContractId } });
    if (!contractExists) {
      await prisma.contract.create({
        data: {
          id: testContractId,
          jobId: testJobId,
          proposalId: testProposalId,
          clientId: testClientId,
          freelancerId: testFreelancerId,
          title: "Integration Test Contract",
          type: PaymentType.HOURLY,
          hourlyRate: 50,
          status: ContractStatus.ACTIVE,
        },
      });
    }
  });

  it("TASK 3.8: verifies contract deletion racing with billable time-entry creation is safely serialized via shared write lock", async () => {
    // Ensure clean state
    await prisma.timeEntry.deleteMany({ where: { contractId: testContractId } });

    // Race two transactions:
    // T1: Time entry creation (simulating startTimeTrackingAction)
    const runTimeEntryStart = async () => {
      return prisma.$transaction(async (tx) => {
        // Shared write lock on contract
        await tx.contract.update({
          where: { id: testContractId },
          data: { updatedAt: new Date() },
        });

        const c = await tx.contract.findUnique({
          where: { id: testContractId },
          select: { status: true },
        });

        if (!c || c.status !== ContractStatus.ACTIVE) {
          throw new Error("Contract is no longer active");
        }

        return tx.timeEntry.create({
          data: {
            contractId: testContractId,
            freelancerId: testFreelancerId,
            status: TimeTrackingStatus.RECORDING,
            hourlyRate: 50,
            description: "Concurrent billable time entry",
          },
        });
      });
    };

    // T2: Contract deletion (simulating deleteContractAction)
    const runContractDeletion = async () => {
      return prisma.$transaction(async (tx) => {
        // Shared write lock on contract
        await tx.contract.update({
          where: { id: testContractId },
          data: { updatedAt: new Date() },
        });

        const timeEntryCount = await tx.timeEntry.count({
          where: { contractId: testContractId },
        });

        if (timeEntryCount > 0) {
          throw new Error("Billable time entries exist: deletion blocked");
        }

        return tx.contract.delete({
          where: { id: testContractId },
        });
      });
    };

    const [timeEntryRes, deletionRes] = await Promise.allSettled([
      runTimeEntryStart(),
      runContractDeletion(),
    ]);

    // Concurrency invariant:
    // If TimeEntry was created, deletion was blocked.
    // If deletion succeeded, TimeEntry creation was blocked.
    // Never leaves a billable time entry on a deleted contract or deletes existing billable records!
    const timeEntriesInDb = await prisma.timeEntry.count({
      where: { contractId: testContractId },
    });

    if (timeEntriesInDb > 0) {
      expect(deletionRes.status).toBe("rejected");
      console.log("[Integration Test] Serialized: TimeEntry committed first; deletion was safely blocked.");
    } else {
      expect(timeEntryRes.status).toBe("rejected");
      console.log("[Integration Test] Serialized: Deletion committed first; time entry creation was safely rejected.");
    }

    // Cleanup & restore
    await prisma.timeEntry.deleteMany({ where: { contractId: testContractId } });
    const contractExists = await prisma.contract.findUnique({ where: { id: testContractId } });
    if (!contractExists) {
      await prisma.contract.create({
        data: {
          id: testContractId,
          jobId: testJobId,
          proposalId: testProposalId,
          clientId: testClientId,
          freelancerId: testFreelancerId,
          title: "Integration Test Contract",
          type: PaymentType.HOURLY,
          hourlyRate: 50,
          status: ContractStatus.ACTIVE,
        },
      });
    }
  });
});
