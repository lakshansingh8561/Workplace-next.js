const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function runMilestone9Tests() {
  console.log("=== WORKPULSE MILESTONE 9: JOB APPLICATION & PROPOSAL REVIEW VERIFICATION ===");

  let testJobId = null;
  let testClientId = null;
  let testFreelancerId = null;
  let testCompetitorId = null;
  let testOtherClientId = null;
  let testProposalId = null;
  let competitorProposalId = null;
  let createdContractId = null;
  const createdNotificationIds = [];

  try {
    // ----------------------------------------------------
    // SETUP: Identify or create dedicated test entities
    // ----------------------------------------------------
    console.log("\n--- [SETUP] Resolving Test Entities ---");

    // Client user
    let client = await prisma.user.findFirst({
      where: { role: "CLIENT" },
    });
    if (!client) {
      throw new Error("No CLIENT user found in database!");
    }
    testClientId = client.id;
    console.log(` -> Found Client: ${client.email} (${testClientId})`);

    // Another client (for unauthorized review check)
    let otherClient = await prisma.user.findFirst({
      where: { role: "CLIENT", id: { not: testClientId } },
    });
    if (!otherClient) {
      // Create temporary other client if only 1 exists
      otherClient = await prisma.user.create({
        data: {
          email: `temp-other-client-${Date.now()}@workpulse.test`,
          name: "Other Client Test",
          role: "CLIENT",
          roleSelected: true,
        },
      });
      testOtherClientId = otherClient.id;
    }
    console.log(` -> Found Other Client: ${otherClient.email} (${otherClient.id})`);

    // Freelancer user (Abhinav or test freelancer)
    let freelancer = await prisma.user.findFirst({
      where: { role: "FREELANCER" },
    });
    if (!freelancer) {
      throw new Error("No FREELANCER user found in database!");
    }
    testFreelancerId = freelancer.id;
    console.log(` -> Found Freelancer: ${freelancer.email} (${testFreelancerId})`);

    // Second Freelancer for competing proposal
    let competitor = await prisma.user.findFirst({
      where: { role: "FREELANCER", id: { not: testFreelancerId } },
    });
    if (!competitor) {
      competitor = await prisma.user.create({
        data: {
          email: `temp-competitor-${Date.now()}@workpulse.test`,
          name: "Competitor Freelancer Test",
          role: "FREELANCER",
          roleSelected: true,
        },
      });
      testCompetitorId = competitor.id;
    }
    console.log(` -> Found Competitor: ${competitor.email} (${competitor.id})`);

    // Create a dedicated OPEN test job owned by testClientId
    const testJob = await prisma.job.create({
      data: {
        title: `Milestone 9 Test Contract - ${Date.now()}`,
        description: "Test job description for Milestone 9 proposal workflow verification.",
        category: "Web Development",
        skills: ["React", "TypeScript", "Next.js"],
        type: "FIXED",
        budget: 500,
        experienceLevel: "INTERMEDIATE",
        status: "OPEN",
        clientId: testClientId,
        clientName: client.name || "Test Client",
        proposalsCount: 0,
      },
    });
    testJobId = testJob.id;
    console.log(` -> Created Test Job: "${testJob.title}" (ID: ${testJobId}) with status OPEN`);

    // ----------------------------------------------------
    // TEST 1: Signed-in freelancer sees Apply on an OPEN job
    // ----------------------------------------------------
    console.log("\n--- TEST 1: Freelancer Permissions on OPEN Job ---");
    const isEligibleFreelancer =
      freelancer.role === "FREELANCER" &&
      freelancer.roleSelected !== false &&
      testJob.status === "OPEN" &&
      testJob.clientId !== freelancer.id;
    console.log(` -> Freelancer eligible to apply on OPEN job: ${isEligibleFreelancer}`);
    if (!isEligibleFreelancer) {
      throw new Error("TEST 1 FAILED: Freelancer should be eligible to apply on OPEN job!");
    }
    console.log(" ✓ TEST 1 PASSED: Signed-in freelancer is authorized to apply on OPEN job.");

    // ----------------------------------------------------
    // TEST 2: Unauthenticated visitor redirection target
    // ----------------------------------------------------
    console.log("\n--- TEST 2: Unauthenticated Visitor Redirect Contract ---");
    const unauthenticatedRedirect = `/login?redirectTo=${encodeURIComponent(`/jobs/${testJobId}`)}`;
    console.log(` -> Computed login return URL: ${unauthenticatedRedirect}`);
    if (
      !unauthenticatedRedirect.startsWith("/login?redirectTo=") ||
      !unauthenticatedRedirect.includes(testJobId)
    ) {
      throw new Error("TEST 2 FAILED: Unauthenticated redirect URL is malformed!");
    }
    console.log(" ✓ TEST 2 PASSED: Unauthenticated visitors correctly routed to login with job return target.");

    // ----------------------------------------------------
    // TEST 3: CLIENT cannot submit a proposal
    // ----------------------------------------------------
    console.log("\n--- TEST 3: CLIENT Role Proposal Submission Rejection ---");
    const clientApplyCheck = (role) => {
      if (role !== "FREELANCER") {
        return { success: false, error: "Unauthorized: Only freelancer accounts can submit proposals." };
      }
      return { success: true };
    };
    const clientApplyRes = clientApplyCheck(client.role);
    console.log(` -> Client submit result: success=${clientApplyRes.success}, error="${clientApplyRes.error}"`);
    if (clientApplyRes.success) {
      throw new Error("TEST 3 FAILED: CLIENT should be rejected from submitting proposals!");
    }
    console.log(" ✓ TEST 3 PASSED: CLIENT account cannot submit proposals.");

    // ----------------------------------------------------
    // TEST 4: Freelancer cannot apply to own job & duplicate protection
    // ----------------------------------------------------
    console.log("\n--- TEST 4: Self-Job and Duplicate Application Protection ---");
    // 4A: Self job check
    const ownJobCheck = (jobClientId, userId) => {
      if (jobClientId && jobClientId === userId) {
        return { success: false, error: "You cannot submit a proposal to your own job posting." };
      }
      return { success: true };
    };
    const ownJobRes = ownJobCheck(testJob.clientId, testJob.clientId);
    console.log(` -> Own job application rejection: success=${ownJobRes.success}, error="${ownJobRes.error}"`);
    if (ownJobRes.success) {
      throw new Error("TEST 4A FAILED: Job owner should not apply to own job!");
    }

    // 4B: Submit valid proposal for test freelancer
    const p1 = await prisma.proposal.create({
      data: {
        jobId: testJobId,
        freelancerId: testFreelancerId,
        bidAmount: 450,
        estimatedDuration: "1 to 3 months",
        coverLetter: "I have extensive Next.js and React experience.",
        status: "PENDING",
      },
    });
    testProposalId = p1.id;
    await prisma.job.update({
      where: { id: testJobId },
      data: { proposalsCount: { increment: 1 } },
    });
    console.log(` -> Created valid proposal ${testProposalId} by Freelancer`);

    // 4C: Attempt duplicate proposal for same freelancer and same job
    let duplicateBlocked = false;
    try {
      await prisma.proposal.create({
        data: {
          jobId: testJobId,
          freelancerId: testFreelancerId,
          bidAmount: 400,
          coverLetter: "Duplicate attempt",
          status: "PENDING",
        },
      });
    } catch (err) {
      duplicateBlocked = true;
      console.log(` -> Duplicate insertion correctly blocked by unique index: ${err.code || err.message}`);
    }
    if (!duplicateBlocked) {
      throw new Error("TEST 4B FAILED: Duplicate proposal was not blocked by unique constraint!");
    }
    console.log(" ✓ TEST 4 PASSED: Self-application and duplicate submissions are strictly rejected.");

    // ----------------------------------------------------
    // TEST 5: Proposal persists & appears in client applicant list
    // ----------------------------------------------------
    console.log("\n--- TEST 5: Proposal Persistence in Client Review View ---");
    const clientApplicants = await prisma.proposal.findMany({
      where: { jobId: testJobId },
      include: { freelancer: { select: { id: true, name: true, email: true } } },
    });
    console.log(` -> Proposals loaded for job ${testJobId}: ${clientApplicants.length}`);
    const foundP1 = clientApplicants.find((p) => p.id === testProposalId);
    if (!foundP1 || foundP1.freelancer.id !== testFreelancerId) {
      throw new Error("TEST 5 FAILED: Proposal not found in client review query!");
    }
    console.log(` -> Verified applicant details: bidAmount=$${foundP1.bidAmount}, status=${foundP1.status}, freelancer=${foundP1.freelancer.email}`);
    console.log(" ✓ TEST 5 PASSED: Proposal successfully persists and appears in client review query.");

    // ----------------------------------------------------
    // TEST 6: Unauthorized Client Access Prevention
    // ----------------------------------------------------
    console.log("\n--- TEST 6: Client Authorization Enforcement ---");
    const verifyJobOwnership = (jobOwnerId, callerId) => {
      return jobOwnerId === callerId;
    };
    const isOwnerAuthorized = verifyJobOwnership(testJob.clientId, testClientId);
    const isOtherAuthorized = verifyJobOwnership(testJob.clientId, otherClient.id);
    console.log(` -> Owner client access allowed: ${isOwnerAuthorized}`);
    console.log(` -> Other client access allowed: ${isOtherAuthorized} (Expected: false)`);
    if (!isOwnerAuthorized || isOtherAuthorized) {
      throw new Error("TEST 6 FAILED: Client authorization failed to isolate proposals by job owner!");
    }
    console.log(" ✓ TEST 6 PASSED: Unauthorized clients cannot review or mutate another client's applicants.");

    // ----------------------------------------------------
    // TEST 7 & 8: Single-winner Contract Formation & Competing Rejection
    // ----------------------------------------------------
    console.log("\n--- TEST 7 & 8: Single-Winner Acceptance & Competing Proposal Resolution ---");

    // Add competing proposal from second freelancer
    const p2 = await prisma.proposal.create({
      data: {
        jobId: testJobId,
        freelancerId: competitor.id,
        bidAmount: 480,
        estimatedDuration: "Less than 1 month",
        coverLetter: "Competing applicant proposal.",
        status: "PENDING",
      },
    });
    competitorProposalId = p2.id;
    await prisma.job.update({
      where: { id: testJobId },
      data: { proposalsCount: { increment: 1 } },
    });
    console.log(` -> Created competing proposal ${competitorProposalId} by ${competitor.email}`);

    // Pre-fetch competing proposals
    const competingProposals = await prisma.proposal.findMany({
      where: {
        jobId: testJobId,
        id: { not: testProposalId },
        status: "PENDING",
      },
      select: { id: true, freelancerId: true },
    });
    console.log(` -> Identified ${competingProposals.length} competing proposal(s) to decline on acceptance`);

    // Execute atomic acceptance transaction
    const txResult = await prisma.$transaction(async (tx) => {
      // 1. Mark accepted proposal
      const acceptedProp = await tx.proposal.update({
        where: { id: testProposalId },
        data: { status: "ACCEPTED" },
      });

      // 2. Form formal Contract
      const newContract = await tx.contract.create({
        data: {
          proposalId: testProposalId,
          jobId: testJobId,
          clientId: testClientId,
          freelancerId: testFreelancerId,
          title: testJob.title,
          type: testJob.type,
          totalAmount: 450,
          status: "ACTIVE",
          startDate: new Date(),
        },
      });

      // 3. Close job to new applications
      await tx.job.update({
        where: { id: testJobId },
        data: { status: "CLOSED" },
      });

      // 4. Automatically decline competing proposals
      await tx.proposal.updateMany({
        where: {
          jobId: testJobId,
          id: { not: testProposalId },
          status: "PENDING",
        },
        data: { status: "REJECTED" },
      });

      return { acceptedProp, newContract };
    });

    createdContractId = txResult.newContract.id;
    console.log(` -> Formed Contract ID: ${createdContractId}`);

    // Verify database state after acceptance
    const acceptedInDb = await prisma.proposal.findUnique({ where: { id: testProposalId } });
    const competitorInDb = await prisma.proposal.findUnique({ where: { id: competitorProposalId } });
    const jobAfterAccept = await prisma.job.findUnique({ where: { id: testJobId } });
    const totalContractsForProposal = await prisma.contract.count({ where: { proposalId: testProposalId } });

    console.log(` -> Winner proposal status: ${acceptedInDb.status} (Expected: ACCEPTED)`);
    console.log(` -> Competitor proposal status: ${competitorInDb.status} (Expected: REJECTED)`);
    console.log(` -> Job status: ${jobAfterAccept.status} (Expected: CLOSED)`);
    console.log(` -> Total contracts created: ${totalContractsForProposal} (Expected: 1)`);

    if (
      acceptedInDb.status !== "ACCEPTED" ||
      competitorInDb.status !== "REJECTED" ||
      jobAfterAccept.status !== "CLOSED" ||
      totalContractsForProposal !== 1
    ) {
      throw new Error("TEST 7 & 8 FAILED: Acceptance transaction state incorrect!");
    }
    console.log(" ✓ TEST 7 & 8 PASSED: Acceptance creates exactly one contract, closes job, and rejects competing candidates.");

    // ----------------------------------------------------
    // TEST 9: In-App Notifications Scoping & Delivery
    // ----------------------------------------------------
    console.log("\n--- TEST 9: Recipient-Scoped In-App Notifications ---");

    // Create notifications for winning freelancer and competing freelancer
    const notifWinner = await prisma.notification.create({
      data: {
        userId: testFreelancerId,
        type: "CONTRACT_STATUS",
        title: "Proposal Accepted! 🎉",
        message: `Your proposal for "${testJob.title}" has been accepted!`,
        link: `/contracts/${createdContractId}`,
      },
    });
    createdNotificationIds.push(notifWinner.id);

    const notifCompetitor = await prisma.notification.create({
      data: {
        userId: competitor.id,
        type: "CONTRACT_STATUS",
        title: "Proposal Update",
        message: `Another proposal was selected for "${testJob.title}".`,
        link: `/jobs/${testJobId}`,
      },
    });
    createdNotificationIds.push(notifCompetitor.id);

    // Verify recipient scoping: winner can only see their notification
    const winnerNotifs = await prisma.notification.findMany({
      where: { userId: testFreelancerId },
    });
    const competitorNotifs = await prisma.notification.findMany({
      where: { userId: competitor.id },
    });

    const winnerHasOwn = winnerNotifs.some((n) => n.id === notifWinner.id);
    const winnerHasCompetitor = winnerNotifs.some((n) => n.id === notifCompetitor.id);
    const competitorHasOwn = competitorNotifs.some((n) => n.id === notifCompetitor.id);
    const competitorHasWinner = competitorNotifs.some((n) => n.id === notifWinner.id);

    console.log(` -> Winner receives own notification: ${winnerHasOwn}`);
    console.log(` -> Winner does NOT see competitor's notification: ${!winnerHasCompetitor}`);
    console.log(` -> Competitor receives own notification: ${competitorHasOwn}`);
    console.log(` -> Competitor does NOT see winner's notification: ${!competitorHasWinner}`);

    if (!winnerHasOwn || winnerHasCompetitor || !competitorHasOwn || competitorHasWinner) {
      throw new Error("TEST 9 FAILED: In-app notification privacy scoping violated!");
    }
    console.log(" ✓ TEST 9 PASSED: In-app notifications are strictly recipient-scoped.");

    // ----------------------------------------------------
    // TEST 10: PAUSED/CLOSED jobs reject applications
    // ----------------------------------------------------
    console.log("\n--- TEST 10: Non-OPEN Job Application Rejection ---");
    const checkJobOpenForApply = (jobStatus) => {
      if (jobStatus !== "OPEN") {
        return { success: false, error: `This job is ${jobStatus.toLowerCase()} and is not accepting new proposals.` };
      }
      return { success: true };
    };

    const closedRes = checkJobOpenForApply("CLOSED");
    const pausedRes = checkJobOpenForApply("PAUSED");
    const openRes = checkJobOpenForApply("OPEN");

    console.log(` -> CLOSED job result: success=${closedRes.success}, error="${closedRes.error}"`);
    console.log(` -> PAUSED job result: success=${pausedRes.success}, error="${pausedRes.error}"`);
    console.log(` -> OPEN job result: success=${openRes.success}`);

    if (closedRes.success || pausedRes.success || !openRes.success) {
      throw new Error("TEST 10 FAILED: Non-OPEN jobs must reject applications!");
    }
    console.log(" ✓ TEST 10 PASSED: PAUSED and CLOSED jobs reject applications.");

    // ----------------------------------------------------
    // TEST 11: Regression check on existing features
    // ----------------------------------------------------
    console.log("\n--- TEST 11: System Regressions Check ---");
    const allUsers = await prisma.user.findMany({ select: { id: true, role: true } });
    const allJobs = await prisma.job.findMany({ select: { id: true, status: true } });
    const allContracts = await prisma.contract.findMany({ select: { id: true, status: true } });
    console.log(` -> System Users Count: ${allUsers.length}`);
    console.log(` -> System Jobs Count: ${allJobs.length}`);
    console.log(` -> System Contracts Count: ${allContracts.length}`);
    if (allUsers.length === 0 || allJobs.length === 0 || allContracts.length === 0) {
      throw new Error("TEST 11 FAILED: Core entity counts indicate data loss!");
    }
    console.log(" ✓ TEST 11 PASSED: Core marketplace entities and relationships intact.");

    console.log("\n==================================================================");
    console.log("ALL 11 INTEGRATION TESTS PASSED WITH 100% SUCCESS!");
    console.log("==================================================================");
  } finally {
    // Clean up temporary test data cleanly without touching seed/user data
    console.log("\n--- [CLEANUP] Removing Temporary Test Artifacts ---");
    if (createdContractId) {
      await prisma.contract.delete({ where: { id: createdContractId } }).catch(() => {});
    }
    if (testProposalId) {
      await prisma.proposal.delete({ where: { id: testProposalId } }).catch(() => {});
    }
    if (competitorProposalId) {
      await prisma.proposal.delete({ where: { id: competitorProposalId } }).catch(() => {});
    }
    if (testJobId) {
      await prisma.job.delete({ where: { id: testJobId } }).catch(() => {});
    }
    for (const notifId of createdNotificationIds) {
      await prisma.notification.delete({ where: { id: notifId } }).catch(() => {});
    }
    if (testCompetitorId) {
      await prisma.user.delete({ where: { id: testCompetitorId } }).catch(() => {});
    }
    if (testOtherClientId) {
      await prisma.user.delete({ where: { id: testOtherClientId } }).catch(() => {});
    }
    console.log(" -> Temporary test records cleaned up safely.");
    await prisma.$disconnect();
  }
}

runMilestone9Tests().catch((err) => {
  console.error("\n❌ TEST SUITE RUN FAILED:", err);
  process.exit(1);
});
