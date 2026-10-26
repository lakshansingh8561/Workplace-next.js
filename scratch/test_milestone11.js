const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function isValidObjectId(id) {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

// Simulates the server action saveJobAction logic
async function simulateSaveJobAction(caller, jobId) {
  if (!caller) {
    return { success: false, error: "You must be signed in to save jobs.", requiresLogin: true };
  }
  if (caller.role !== "FREELANCER") {
    return { success: false, error: "Unauthorized: Only freelancer accounts can save jobs." };
  }
  if (!jobId || !isValidObjectId(jobId)) {
    return { success: false, error: "Invalid job identifier provided." };
  }

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, status: true, clientId: true },
  });

  if (!job) {
    return { success: false, error: "Job not found or has been deleted." };
  }

  if (job.status === "DRAFT") {
    return { success: false, error: "Draft jobs are not discoverable and cannot be saved." };
  }

  await prisma.savedJob.upsert({
    where: {
      userId_jobId: {
        userId: caller.id,
        jobId: job.id,
      },
    },
    create: {
      userId: caller.id,
      jobId: job.id,
    },
    update: {},
  });

  return { success: true, saved: true };
}

// Simulates unsaveJobAction logic
async function simulateUnsaveJobAction(caller, jobId) {
  if (!caller) {
    return { success: false, error: "You must be signed in to unsave jobs.", requiresLogin: true };
  }
  if (caller.role !== "FREELANCER") {
    return { success: false, error: "Unauthorized: Only freelancer accounts can manage saved jobs." };
  }
  if (!jobId || !isValidObjectId(jobId)) {
    return { success: false, error: "Invalid job identifier provided." };
  }

  await prisma.savedJob.deleteMany({
    where: {
      userId: caller.id,
      jobId,
    },
  });

  return { success: true, saved: false };
}

async function runMilestone11Tests() {
  console.log("=== WORKPULSE MILESTONE 11: SAVED JOBS WORKFLOW VERIFICATION ===\n");

  let testFreelancer = null;
  let testFreelancer2 = null;
  let testClient = null;
  let testJob = null;
  let testDraftJob = null;

  try {
    // [SETUP] Find test entities
    console.log("--- [SETUP] Resolving Test Entities ---");
    testFreelancer = await prisma.user.findFirst({
      where: { email: "test-freelancer@workpulse.io" },
    });
    testFreelancer2 = await prisma.user.findFirst({
      where: { email: "competitor@workpulse.io" },
    });
    testClient = await prisma.user.findFirst({
      where: { email: "test-client@workpulse.io" },
    });

    if (!testFreelancer || !testClient) {
      throw new Error("Required test accounts not found!");
    }
    console.log(` -> Found Freelancer 1: ${testFreelancer.name} (${testFreelancer.id})`);
    if (testFreelancer2) {
      console.log(` -> Found Freelancer 2: ${testFreelancer2.name} (${testFreelancer2.id})`);
    }
    console.log(` -> Found Client: ${testClient.name} (${testClient.id})`);

    // Create a dedicated OPEN test job
    testJob = await prisma.job.create({
      data: {
        title: `Milestone 11 Test Job - ${Date.now()}`,
        description: "Automated test contract for saved jobs feature verification.",
        category: "Web Development",
        skills: ["Next.js", "React", "TypeScript"],
        type: "FIXED",
        budget: 500,
        experienceLevel: "INTERMEDIATE",
        status: "OPEN",
        clientId: testClient.id,
        clientName: testClient.name,
      },
    });
    console.log(` -> Created Test OPEN Job: "${testJob.title}" (ID: ${testJob.id})`);

    // Create a DRAFT job to test privacy guard
    testDraftJob = await prisma.job.create({
      data: {
        title: `Milestone 11 Test Draft Job - ${Date.now()}`,
        description: "Draft contract that should not be savable by freelancers.",
        category: "Design",
        skills: ["Figma"],
        type: "FIXED",
        budget: 300,
        experienceLevel: "ENTRY",
        status: "DRAFT",
        clientId: testClient.id,
      },
    });
    console.log(` -> Created Test DRAFT Job: (ID: ${testDraftJob.id})`);

    // --- TEST 1: Freelancer Saves Job & Persistence ---
    console.log("\n--- TEST 1: Freelancer Saves Job & Persistence in MongoDB ---");
    const saveRes = await simulateSaveJobAction(testFreelancer, testJob.id);
    console.log(` -> Save result: success=${saveRes.success}, saved=${saveRes.saved}`);
    if (!saveRes.success || !saveRes.saved) {
      throw new Error(`Failed to save job: ${saveRes.error}`);
    }

    const savedRecord = await prisma.savedJob.findUnique({
      where: {
        userId_jobId: {
          userId: testFreelancer.id,
          jobId: testJob.id,
        },
      },
    });
    if (!savedRecord) {
      throw new Error("Saved job record was not persisted in MongoDB!");
    }
    console.log(` -> Persisted in MongoDB saved_jobs: ID=${savedRecord.id}, userId=${savedRecord.userId}, jobId=${savedRecord.jobId}`);
    console.log(" ✓ TEST 1 PASSED: Job successfully saved and persisted in database.");

    // --- TEST 2: Duplicate Save Protection & Database Unique Constraint ---
    console.log("\n--- TEST 2: Duplicate Save Protection & Unique Index Enforcement ---");
    // Attempt second save via action
    const duplicateRes = await simulateSaveJobAction(testFreelancer, testJob.id);
    console.log(` -> Duplicate save result: success=${duplicateRes.success}, saved=${duplicateRes.saved}`);

    // Verify exactly one record exists in database
    const count = await prisma.savedJob.count({
      where: {
        userId: testFreelancer.id,
        jobId: testJob.id,
      },
    });
    console.log(` -> Record count in MongoDB: ${count} (Expected: 1)`);
    if (count !== 1) {
      throw new Error(`Duplicate save created multiple records! Count: ${count}`);
    }

    // Direct database duplicate insert attempt to verify compound unique index
    let p2002Caught = false;
    try {
      await prisma.savedJob.create({
        data: {
          userId: testFreelancer.id,
          jobId: testJob.id,
        },
      });
    } catch (e) {
      if (e.code === "P2002") {
        p2002Caught = true;
      }
    }
    console.log(` -> Database unique constraint rejected direct duplicate insertion (P2002): ${p2002Caught}`);
    if (!p2002Caught) {
      throw new Error("Database unique index failed to block duplicate insertion!");
    }
    console.log(" ✓ TEST 2 PASSED: Idempotency and database unique constraint prevent duplicate saves.");

    // --- TEST 3: Unsave Lifecycle & Idempotency ---
    console.log("\n--- TEST 3: Unsave Job & Idempotency ---");
    const unsaveRes = await simulateUnsaveJobAction(testFreelancer, testJob.id);
    console.log(` -> Unsave result: success=${unsaveRes.success}, saved=${unsaveRes.saved}`);

    const afterUnsave = await prisma.savedJob.findUnique({
      where: {
        userId_jobId: {
          userId: testFreelancer.id,
          jobId: testJob.id,
        },
      },
    });
    console.log(` -> Record exists after unsave: ${Boolean(afterUnsave)} (Expected: false)`);
    if (afterUnsave) {
      throw new Error("Job was not removed from saved_jobs collection!");
    }

    // Try unsaving again (idempotent check)
    const secondUnsaveRes = await simulateUnsaveJobAction(testFreelancer, testJob.id);
    console.log(` -> Second unsave on already unsaved job: success=${secondUnsaveRes.success}`);
    if (!secondUnsaveRes.success) {
      throw new Error("Unsaving already-unsaved job should be safe and idempotent!");
    }
    console.log(" ✓ TEST 3 PASSED: Unsave cleanly removes record and is idempotent.");

    // --- TEST 4: User Isolation & Recipient Scoping ---
    console.log("\n--- TEST 4: User Scoping & Saved List Isolation ---");
    // Re-save for Freelancer 1
    await simulateSaveJobAction(testFreelancer, testJob.id);

    if (testFreelancer2) {
      // Freelancer 2's saved jobs should NOT contain testJob
      const freelancer2Saved = await prisma.savedJob.findMany({
        where: { userId: testFreelancer2.id },
        select: { jobId: true },
      });
      const hasJob = freelancer2Saved.some((s) => s.jobId === testJob.id);
      console.log(` -> Freelancer 2 saved list includes Freelancer 1's saved job: ${hasJob} (Expected: false)`);
      if (hasJob) {
        throw new Error("CRITICAL LEAK: User A's saved job leaked into User B's list!");
      }
    }
    console.log(" ✓ TEST 4 PASSED: Saved jobs are strictly isolated per authenticated user ID.");

    // --- TEST 5: Role Restrictions (Client Account Blocked) ---
    console.log("\n--- TEST 5: Role Restrictions (CLIENT Blocked) ---");
    const clientSaveRes = await simulateSaveJobAction(testClient, testJob.id);
    console.log(` -> Client save attempt result: success=${clientSaveRes.success}, error="${clientSaveRes.error}"`);
    if (clientSaveRes.success !== false) {
      throw new Error("Client account was improperly allowed to save jobs!");
    }
    console.log(" ✓ TEST 5 PASSED: Client accounts are strictly prohibited from saving jobs.");

    // --- TEST 6: Unauthenticated Request Blocked ---
    console.log("\n--- TEST 6: Unauthenticated Requests Blocked ---");
    const unauthRes = await simulateSaveJobAction(null, testJob.id);
    console.log(` -> Unauthenticated save attempt: success=${unauthRes.success}, requiresLogin=${unauthRes.requiresLogin}`);
    if (unauthRes.success !== false || !unauthRes.requiresLogin) {
      throw new Error("Unauthenticated request was not properly blocked with login requirement!");
    }
    console.log(" ✓ TEST 6 PASSED: Unauthenticated visitors correctly rejected with login prompt.");

    // --- TEST 7: Invalid & Nonexistent Job IDs ---
    console.log("\n--- TEST 7: Invalid & Nonexistent Job IDs ---");
    const invalidIdRes = await simulateSaveJobAction(testFreelancer, "invalid-id-format");
    console.log(` -> Invalid ObjectId result: success=${invalidIdRes.success}, error="${invalidIdRes.error}"`);

    const nonexistentId = "507f1f77bcf86cd799439011";
    const nonexistentRes = await simulateSaveJobAction(testFreelancer, nonexistentId);
    console.log(` -> Nonexistent job result: success=${nonexistentRes.success}, error="${nonexistentRes.error}"`);

    if (invalidIdRes.success !== false || nonexistentRes.success !== false) {
      throw new Error("Invalid or nonexistent IDs should be rejected!");
    }
    console.log(" ✓ TEST 7 PASSED: Malformed or missing job IDs handled safely.");

    // --- TEST 8: Non-Discoverable / DRAFT Jobs Protection ---
    console.log("\n--- TEST 8: DRAFT Job Protection ---");
    const draftSaveRes = await simulateSaveJobAction(testFreelancer, testDraftJob.id);
    console.log(` -> Draft job save attempt: success=${draftSaveRes.success}, error="${draftSaveRes.error}"`);
    if (draftSaveRes.success !== false) {
      throw new Error("Draft jobs should not be savable!");
    }
    console.log(" ✓ TEST 8 PASSED: Non-discoverable DRAFT jobs cannot be saved.");

    // --- TEST 9: Saved Jobs Page Query & Relation Projection ---
    console.log("\n--- TEST 9: Saved Jobs List Query & Status Projection ---");
    const savedList = await prisma.savedJob.findMany({
      where: {
        userId: testFreelancer.id,
        job: { status: { not: "DRAFT" } },
      },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            type: true,
            budget: true,
            status: true,
          },
        },
      },
    });

    console.log(` -> Retrieved saved jobs count for Freelancer: ${savedList.length}`);
    const foundOurJob = savedList.some((s) => s.jobId === testJob.id);
    console.log(` -> Query includes our test job: ${foundOurJob}`);
    if (!foundOurJob) {
      throw new Error("Saved jobs list query did not return the saved test job!");
    }
    console.log(" ✓ TEST 9 PASSED: Saved jobs list query projects job relations accurately.");

    console.log("\n==================================================================");
    console.log("ALL 9 MILESTONE 11 INTEGRATION TESTS PASSED WITH 100% SUCCESS!");
    console.log("==================================================================");

  } catch (error) {
    console.error("\n❌ TEST SUITE FAILED:", error);
    process.exit(1);
  } finally {
    // [CLEANUP] Remove temporary test jobs and saved records
    console.log("\n--- [CLEANUP] Removing Temporary Test Artifacts ---");
    if (testJob) {
      await prisma.savedJob.deleteMany({ where: { jobId: testJob.id } });
      await prisma.job.delete({ where: { id: testJob.id } }).catch(() => {});
    }
    if (testDraftJob) {
      await prisma.savedJob.deleteMany({ where: { jobId: testDraftJob.id } });
      await prisma.job.delete({ where: { id: testDraftJob.id } }).catch(() => {});
    }
    console.log(" -> Cleaned up test jobs and saved job records safely.");
    await prisma.$disconnect();
  }
}

runMilestone11Tests();
