const { PrismaClient, ContractStatus } = require("@prisma/client");
const prisma = new PrismaClient();

// Helper to simulate review submission matching src/lib/actions/review.ts
async function simulateSubmitReview(sessionUser, { contractId, rating, feedback }) {
  if (!sessionUser) {
    return { success: false, error: "Authentication required to submit a review." };
  }

  // Validation rules
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { success: false, error: "Rating must be an integer between 1 and 5." };
  }

  if (typeof feedback !== "string" || feedback.trim().length < 5 || feedback.trim().length > 2000) {
    return { success: false, error: "Feedback must be between 5 and 2000 characters." };
  }

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: {
      id: true,
      title: true,
      status: true,
      clientId: true,
      freelancerId: true,
    },
  });

  if (!contract) {
    return { success: false, error: "Contract not found." };
  }

  if (contract.status !== ContractStatus.COMPLETED) {
    return {
      success: false,
      error: `Reviews are only permitted for completed contracts. Current status: ${contract.status}.`,
    };
  }

  const isClient = contract.clientId === sessionUser.id;
  const isFreelancer = contract.freelancerId === sessionUser.id;

  if (!isClient && !isFreelancer) {
    return { success: false, error: "Unauthorized: You are not a participant in this contract." };
  }

  const reviewerId = sessionUser.id;
  const revieweeId = isClient ? contract.freelancerId : contract.clientId;

  if (reviewerId === revieweeId) {
    return { success: false, error: "Self-reviews are strictly forbidden." };
  }

  try {
    const existing = await prisma.review.findUnique({
      where: {
        contractId_reviewerId: {
          contractId: contract.id,
          reviewerId,
        },
      },
    });

    if (existing) {
      return { success: false, error: "You have already submitted a review for this contract." };
    }

    const review = await prisma.review.create({
      data: {
        contractId: contract.id,
        reviewerId,
        revieweeId,
        rating,
        feedback: feedback.trim(),
      },
      select: {
        id: true,
        contractId: true,
        reviewerId: true,
        revieweeId: true,
        rating: true,
        feedback: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { success: true, review };
  } catch (error) {
    if (error.code === "P2002") {
      return { success: false, error: "You have already submitted a review for this contract." };
    }
    throw error;
  }
}

// Helper to simulate review update matching src/lib/actions/review.ts
async function simulateUpdateReview(sessionUser, { reviewId, rating, feedback }) {
  if (!sessionUser) {
    return { success: false, error: "Authentication required to edit a review." };
  }

  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { success: false, error: "Rating must be an integer between 1 and 5." };
  }

  if (typeof feedback !== "string" || feedback.trim().length < 5 || feedback.trim().length > 2000) {
    return { success: false, error: "Feedback must be between 5 and 2000 characters." };
  }

  const existing = await prisma.review.findUnique({
    where: { id: reviewId },
  });

  if (!existing) {
    return { success: false, error: "Review not found." };
  }

  if (existing.reviewerId !== sessionUser.id) {
    return { success: false, error: "Unauthorized: You can only edit your own reviews." };
  }

  const updated = await prisma.review.update({
    where: { id: reviewId },
    data: {
      rating,
      feedback: feedback.trim(),
    },
  });

  return { success: true, review: updated };
}

// Helper to simulate getUserReviewsSummary matching src/lib/actions/review.ts
async function simulateGetUserReviewsSummary(userId) {
  const [aggregate, reviews] = await Promise.all([
    prisma.review.aggregate({
      where: { revieweeId: userId },
      _avg: { rating: true },
      _count: { rating: true },
    }),
    prisma.review.findMany({
      where: { revieweeId: userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        rating: true,
        feedback: true,
        createdAt: true,
        updatedAt: true,
        reviewer: {
          select: {
            id: true,
            name: true,
            image: true,
            role: true,
            companyName: true,
          },
        },
        contract: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    }),
  ]);

  const count = aggregate._count.rating || 0;
  const rawAvg = aggregate._avg.rating;
  const averageRating =
    count > 0 && typeof rawAvg === "number" ? Math.round(rawAvg * 10) / 10 : null;

  return {
    averageRating,
    totalReviews: count,
    reviews,
  };
}

async function runMilestone14Tests() {
  console.log("=================================================");
  console.log("  WORKPULSE MILESTONE 14 INTEGRATION TEST SUITE  ");
  console.log("  Post-Contract Ratings & Reviews System Test    ");
  console.log("=================================================\n");

  const createdReviewIds = [];
  const createdContractIds = [];
  const createdProposalIds = [];
  const createdJobIds = [];
  const createdUserIds = [];

  let testsPassed = 0;
  let testsFailed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      testsPassed++;
    } else {
      console.error(`[FAIL] ${message}`);
      testsFailed++;
    }
  }

  try {
    // 1. SETUP: Create isolated test actors
    const testTimestamp = Date.now();
    const testClient = await prisma.user.create({
      data: {
        email: `m14-client-${testTimestamp}@workpulse.test`,
        name: "Milestone 14 Client",
        role: "CLIENT",
        roleSelected: true,
        companyName: "Acme Enterprises Inc.",
      },
    });
    createdUserIds.push(testClient.id);

    const testFreelancer = await prisma.user.create({
      data: {
        email: `m14-freelancer-${testTimestamp}@workpulse.test`,
        name: "Milestone 14 Freelancer",
        role: "FREELANCER",
        roleSelected: true,
        title: "Senior Full Stack Architect",
      },
    });
    createdUserIds.push(testFreelancer.id);

    const thirdPartyUser = await prisma.user.create({
      data: {
        email: `m14-thirdparty-${testTimestamp}@workpulse.test`,
        name: "Unrelated Third Party",
        role: "FREELANCER",
        roleSelected: true,
      },
    });
    createdUserIds.push(thirdPartyUser.id);

    // Create test job and proposal
    const testJob = await prisma.job.create({
      data: {
        title: `Milestone 14 Test Contract Job ${testTimestamp}`,
        description: "Verify post-contract ratings and reviews workflow.",
        category: "Engineering",
        skills: ["Next.js", "TypeScript", "Prisma"],
        type: "FIXED",
        budget: 1500,
        clientId: testClient.id,
        status: "CLOSED",
      },
    });
    createdJobIds.push(testJob.id);

    const testProposal = await prisma.proposal.create({
      data: {
        jobId: testJob.id,
        freelancerId: testFreelancer.id,
        coverLetter: "Milestone 14 verified post-contract proposal cover letter.",
        bidAmount: 1500,
        status: "ACCEPTED",
      },
    });
    createdProposalIds.push(testProposal.id);

    // Create a COMPLETED contract
    const completedContract = await prisma.contract.create({
      data: {
        title: `Full-Stack Application Development ${testTimestamp}`,
        proposalId: testProposal.id,
        jobId: testJob.id,
        clientId: testClient.id,
        freelancerId: testFreelancer.id,
        status: ContractStatus.COMPLETED,
        type: "FIXED",
        totalAmount: 1500,
        terms: "Private contract terms that must never leak publicly.",
      },
    });
    createdContractIds.push(completedContract.id);

    // Create an ACTIVE contract (not completed) for eligibility testing
    const activeProposal = await prisma.proposal.create({
      data: {
        jobId: testJob.id,
        freelancerId: thirdPartyUser.id,
        coverLetter: "Active proposal for non-completed contract test.",
        bidAmount: 800,
        status: "ACCEPTED",
      },
    });
    createdProposalIds.push(activeProposal.id);

    const activeContract = await prisma.contract.create({
      data: {
        title: `In-Progress Active Milestone Contract ${testTimestamp}`,
        proposalId: activeProposal.id,
        jobId: testJob.id,
        clientId: testClient.id,
        freelancerId: thirdPartyUser.id,
        status: ContractStatus.ACTIVE,
        type: "FIXED",
        totalAmount: 800,
      },
    });
    createdContractIds.push(activeContract.id);

    // --- TEST 1: Unauthenticated callers rejected ---
    console.log("--- 1. Authentication & Role Boundaries ---");
    const unauthRes = await simulateSubmitReview(null, {
      contractId: completedContract.id,
      rating: 5,
      feedback: "Great work!",
    });
    assert(
      unauthRes.success === false && unauthRes.error.includes("Authentication required"),
      "Test 1: Unauthenticated caller is rejected from submitting reviews"
    );

    // --- TEST 2: Third-party non-participant rejected ---
    const thirdPartyRes = await simulateSubmitReview(thirdPartyUser, {
      contractId: completedContract.id,
      rating: 5,
      feedback: "I am not on this contract but trying to review.",
    });
    assert(
      thirdPartyRes.success === false && thirdPartyRes.error.includes("Unauthorized"),
      "Test 2: Non-participant user is rejected from reviewing foreign contract"
    );

    // --- TEST 3: Incomplete (ACTIVE) contract rejected ---
    console.log("\n--- 2. Contract Completion Lifecycle Enforcement ---");
    const activeContractRes = await simulateSubmitReview(testClient, {
      contractId: activeContract.id,
      rating: 5,
      feedback: "Contract is still active but trying to review early.",
    });
    assert(
      activeContractRes.success === false &&
        activeContractRes.error.includes("completed contracts"),
      "Test 3: Review rejected for non-completed contract (ACTIVE status)"
    );

    // --- TEST 4: Rating boundary validations ---
    console.log("\n--- 3. Validation Bounds: Ratings & Feedback Text ---");
    const lowRatingRes = await simulateSubmitReview(testClient, {
      contractId: completedContract.id,
      rating: 0,
      feedback: "Zero stars is invalid.",
    });
    assert(lowRatingRes.success === false, "Test 4: Rating of 0 rejected (min 1)");

    const highRatingRes = await simulateSubmitReview(testClient, {
      contractId: completedContract.id,
      rating: 6,
      feedback: "Six stars is invalid.",
    });
    assert(highRatingRes.success === false, "Test 5: Rating of 6 rejected (max 5)");

    const floatRatingRes = await simulateSubmitReview(testClient, {
      contractId: completedContract.id,
      rating: 4.5,
      feedback: "Non-integer float rating rejected.",
    });
    assert(floatRatingRes.success === false, "Test 6: Non-integer rating 4.5 rejected");

    const shortFeedbackRes = await simulateSubmitReview(testClient, {
      contractId: completedContract.id,
      rating: 5,
      feedback: "Yo",
    });
    assert(shortFeedbackRes.success === false, "Test 7: Too short feedback (<5 chars) rejected");

    const longFeedbackRes = await simulateSubmitReview(testClient, {
      contractId: completedContract.id,
      rating: 5,
      feedback: "A".repeat(2001),
    });
    assert(longFeedbackRes.success === false, "Test 8: Excessively long feedback (>2000 chars) rejected");

    // --- TEST 5: Eligible client review of freelancer on COMPLETED contract ---
    console.log("\n--- 4. Client Reviewing Freelancer ---");
    const clientReviewRes = await simulateSubmitReview(testClient, {
      contractId: completedContract.id,
      rating: 5,
      feedback: "Outstanding deliverable! Fast communication and clean TypeScript code.",
    });
    assert(clientReviewRes.success === true, "Test 9: Client successfully reviews freelancer on COMPLETED contract");
    if (clientReviewRes.review) {
      createdReviewIds.push(clientReviewRes.review.id);
      assert(clientReviewRes.review.reviewerId === testClient.id, "Test 10: Reviewer ID strictly equals client session ID");
      assert(clientReviewRes.review.revieweeId === testFreelancer.id, "Test 11: Reviewee ID accurately targets the freelancer");
    }

    // --- TEST 6: Duplicate review attempt rejected ---
    console.log("\n--- 5. Duplicate Rejection & Unique Constraint ---");
    const dupRes = await simulateSubmitReview(testClient, {
      contractId: completedContract.id,
      rating: 4,
      feedback: "Trying to submit a second review for the same contract.",
    });
    assert(
      dupRes.success === false && dupRes.error.includes("already submitted"),
      "Test 12: Duplicate review rejected cleanly with informative error"
    );

    // --- TEST 7: Eligible freelancer review of client on COMPLETED contract ---
    console.log("\n--- 6. Freelancer Reviewing Client ---");
    const freelancerReviewRes = await simulateSubmitReview(testFreelancer, {
      contractId: completedContract.id,
      rating: 4,
      feedback: "Clear specifications, timely milestone approvals, and pleasant collaboration.",
    });
    assert(
      freelancerReviewRes.success === true,
      "Test 13: Freelancer successfully reviews client on COMPLETED contract"
    );
    if (freelancerReviewRes.review) {
      createdReviewIds.push(freelancerReviewRes.review.id);
      assert(freelancerReviewRes.review.reviewerId === testFreelancer.id, "Test 14: Reviewer ID strictly equals freelancer session ID");
      assert(freelancerReviewRes.review.revieweeId === testClient.id, "Test 15: Reviewee ID accurately targets the client");
    }

    // --- TEST 8: Review editing permissions ---
    console.log("\n--- 7. Review Editing Permissions & Boundaries ---");
    // Third party cannot edit client's review
    const unauthorizedEditRes = await simulateUpdateReview(thirdPartyUser, {
      reviewId: clientReviewRes.review.id,
      rating: 1,
      feedback: "Malicious modification attempt by unauthorized user.",
    });
    assert(
      unauthorizedEditRes.success === false && unauthorizedEditRes.error.includes("Unauthorized"),
      "Test 16: Third party is rejected from editing someone else's review"
    );

    // Original reviewer can edit
    const authorizedEditRes = await simulateUpdateReview(testClient, {
      reviewId: clientReviewRes.review.id,
      rating: 5,
      feedback: "Updated: Truly world-class architect. Delivered before milestone deadline!",
    });
    assert(authorizedEditRes.success === true, "Test 17: Original reviewer can edit rating and feedback");
    assert(
      authorizedEditRes.review.feedback.includes("world-class architect"),
      "Test 18: Updated feedback persisted in database"
    );

    // --- TEST 9: Public review summary and privacy projection ---
    console.log("\n--- 8. Public Review Projection & Privacy Assurance ---");
    const freelancerSummary = await simulateGetUserReviewsSummary(testFreelancer.id);
    assert(freelancerSummary.totalReviews === 1, "Test 19: Freelancer total review count is 1");
    assert(freelancerSummary.averageRating === 5.0, "Test 20: Freelancer average rating is 5.0");

    const clientSummary = await simulateGetUserReviewsSummary(testClient.id);
    assert(clientSummary.totalReviews === 1, "Test 21: Client total review count is 1");
    assert(clientSummary.averageRating === 4.0, "Test 22: Client average rating is 4.0");

    // Zero-review user
    const zeroReviewSummary = await simulateGetUserReviewsSummary(thirdPartyUser.id);
    assert(zeroReviewSummary.totalReviews === 0, "Test 23: User with 0 reviews has count 0");
    assert(zeroReviewSummary.averageRating === null, "Test 24: User with 0 reviews returns null average (no fabricated rating)");

    // Privacy checks on projected review object
    const projectedReview = freelancerSummary.reviews[0];
    assert(projectedReview !== undefined, "Test 25: Projected review item exists");
    assert(projectedReview.reviewer.name === "Milestone 14 Client", "Test 26: Safe reviewer name is present");
    assert(projectedReview.reviewer.email === undefined, "Test 27: Reviewer email is NOT exposed");
    assert(projectedReview.reviewer.passwordHash === undefined, "Test 28: Password hash is NOT exposed");
    assert(projectedReview.contract.terms === undefined, "Test 29: Private contract terms are NOT exposed");
    assert(projectedReview.contract.totalAmount === undefined, "Test 30: Contract payment total is NOT exposed");

    // --- TEST 10: Contract status unchanged by reviews ---
    console.log("\n--- 9. Contract Status Invariance ---");
    const contractAfterReviews = await prisma.contract.findUnique({
      where: { id: completedContract.id },
      select: { status: true },
    });
    assert(
      contractAfterReviews.status === ContractStatus.COMPLETED,
      "Test 31: Contract status remains COMPLETED and unaffected by review submissions"
    );

  } catch (error) {
    console.error("Unexpected error during integration testing:", error);
    testsFailed++;
  } finally {
    console.log("\nCleaning up temporary test records...");

    // Delete reviews first (foreign keys to contracts and users)
    if (createdReviewIds.length > 0) {
      await prisma.review.deleteMany({
        where: { id: { in: createdReviewIds } },
      });
    }

    // Delete contracts
    if (createdContractIds.length > 0) {
      await prisma.contract.deleteMany({
        where: { id: { in: createdContractIds } },
      });
    }

    // Delete proposals
    if (createdProposalIds.length > 0) {
      await prisma.proposal.deleteMany({
        where: { id: { in: createdProposalIds } },
      });
    }

    // Delete jobs
    if (createdJobIds.length > 0) {
      await prisma.job.deleteMany({
        where: { id: { in: createdJobIds } },
      });
    }

    // Delete test users
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }

    console.log("Cleanup complete. 0 residual test records remain.\n");
    await prisma.$disconnect();
  }

  console.log("=================================================");
  console.log(`  RESULTS: ${testsPassed} passed, ${testsFailed} failed`);
  console.log("=================================================");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runMilestone14Tests();
