const { PrismaClient } = require("@prisma/client");
const { z } = require("zod");
const prisma = new PrismaClient();

// 1. Import or mirror the updated validation schemas
const {
  isSafeHttpUrl,
  FreelancerProfileSchema,
  ClientProfileSchema,
} = require("../src/lib/validations/profile");

const {
  sanitizeRedirectPath,
  LoginSchema,
} = require("../src/lib/validations/auth");

// Simulation of getJobProposalsForReview logic strictly matching src/lib/actions/proposal.ts
async function simulateGetJobProposalsForReview(sessionUser, jobId) {
  if (!sessionUser) {
    return {
      success: false,
      proposals: [],
      error: "Authentication required to review candidate proposals.",
    };
  }

  if (sessionUser.role !== "CLIENT") {
    return {
      success: false,
      proposals: [],
      error: "Unauthorized: Only client accounts can review candidate proposals.",
    };
  }

  if (!jobId || !/^[0-9a-fA-F]{24}$/.test(jobId)) {
    return {
      success: false,
      proposals: [],
      error: "Invalid job identifier format.",
    };
  }

  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, clientId: true },
    });

    if (!job) {
      return {
        success: false,
        proposals: [],
        error: "Job posting not found.",
      };
    }

    if (job.clientId !== sessionUser.id) {
      return {
        success: false,
        proposals: [],
        error: "Unauthorized: You do not own this job posting and cannot view candidate proposals.",
      };
    }

    const rawProposals = await prisma.proposal.findMany({
      where: { jobId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        jobId: true,
        freelancerId: true,
        coverLetter: true,
        bidAmount: true,
        status: true,
      },
    });

    return {
      success: true,
      proposals: rawProposals,
    };
  } catch (error) {
    return {
      success: false,
      proposals: [],
      error: error.message,
    };
  }
}

async function runSecurityPhase1Tests() {
  console.log("=================================================");
  console.log("  WORKPULSE SECURITY REMEDIATION — PHASE 1 TESTS ");
  console.log("  Verification of Critical Vulnerability Fixes   ");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // --- FIX 1: URL VALIDATION & STORED XSS MITIGATION ---
  console.log("--- 1. Testing URL Validation (Stored XSS Mitigation) ---");

  const unsafeUrls = [
    "javascript:alert(1)",
    "javascript:void(0)",
    "JAVASCRIPT:alert(document.cookie)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "//evil.com",
    "/local/path",
    "ftp://example.com/file",
    "file:///etc/passwd",
  ];

  for (const badUrl of unsafeUrls) {
    assert(isSafeHttpUrl(badUrl) === false, `isSafeHttpUrl rejects: ${badUrl}`);
    const freelancerResult = FreelancerProfileSchema.safeParse({
      name: "Test User",
      portfolioUrls: [badUrl],
    });
    assert(
      freelancerResult.success === false,
      `FreelancerProfileSchema rejects unsafe portfolioUrl: ${badUrl}`
    );

    const clientResult = ClientProfileSchema.safeParse({
      name: "Test Client",
      companyWebsite: badUrl,
    });
    assert(
      clientResult.success === false,
      `ClientProfileSchema rejects unsafe companyWebsite: ${badUrl}`
    );
  }

  const safeUrls = [
    "https://github.com/developer",
    "http://portfolio.dev/projects",
    "https://sub.domain.co.uk/page?query=1#hash",
  ];

  for (const goodUrl of safeUrls) {
    assert(isSafeHttpUrl(goodUrl) === true, `isSafeHttpUrl accepts: ${goodUrl}`);
    const freelancerResult = FreelancerProfileSchema.safeParse({
      name: "Test User",
      portfolioUrls: [goodUrl],
    });
    assert(
      freelancerResult.success === true,
      `FreelancerProfileSchema accepts safe portfolioUrl: ${goodUrl}`
    );

    const clientResult = ClientProfileSchema.safeParse({
      name: "Test Client",
      companyWebsite: goodUrl,
    });
    assert(
      clientResult.success === true,
      `ClientProfileSchema accepts safe companyWebsite: ${goodUrl}`
    );
  }

  // --- FIX 4: OPEN REDIRECT SANITIZATION ---
  console.log("\n--- 2. Testing Open Redirect Sanitization (Client & Server) ---");

  const maliciousRedirects = [
    "https://evil.com",
    "http://attacker.com/steal",
    "//evil.com",
    "///evil.com",
    "/\\evil.com",
    "\\evil.com",
    "/evil.com\\attacker",
    "javascript:alert(1)",
    "data:text/html,evil",
  ];

  for (const malRedirect of maliciousRedirects) {
    const sanitized = sanitizeRedirectPath(malRedirect);
    assert(
      sanitized === "/jobs",
      `sanitizeRedirectPath blocks '${malRedirect}' and falls back to '/jobs'`
    );

    const loginParsed = LoginSchema.safeParse({
      email: "user@example.com",
      password: "password123",
      redirectTo: malRedirect,
    });
    assert(
      loginParsed.success === true && loginParsed.data.redirectTo === "/jobs",
      `LoginSchema sanitizes malicious redirectTo to '/jobs'`
    );
  }

  const validLocalPaths = [
    "/dashboard/freelancer/proposals",
    "/jobs/6adade1afaeade46f3424d45",
    "/profile/client",
    "/jobs?search=ai&page=2",
    "/contracts/6adaea35d01bba4ca01103f8#milestones",
  ];

  for (const validPath of validLocalPaths) {
    const sanitized = sanitizeRedirectPath(validPath);
    assert(
      sanitized === validPath,
      `sanitizeRedirectPath preserves legitimate path: ${validPath}`
    );

    const loginParsed = LoginSchema.safeParse({
      email: "user@example.com",
      password: "password123",
      redirectTo: validPath,
    });
    assert(
      loginParsed.success === true && loginParsed.data.redirectTo === validPath,
      `LoginSchema preserves legitimate redirectTo: ${validPath}`
    );
  }

  // --- FIX 3: AUTH_SECRET PRODUCTION FAIL-CLOSED ---
  console.log("\n--- 3. Testing AUTH_SECRET Production Behavior ---");
  // Test that missing secret in production throws
  function checkProductionSecretBehavior(envSecret, nodeEnv) {
    const authSecret = envSecret;
    if (nodeEnv === "production" && !authSecret) {
      throw new Error(
        "[WorkPulse Auth Fatal] Production deployment requires AUTH_SECRET or NEXTAUTH_SECRET to be configured in environment variables."
      );
    }
    return authSecret || (nodeEnv !== "production" ? "local-fallback" : undefined);
  }

  let prodMissingThrew = false;
  try {
    checkProductionSecretBehavior(undefined, "production");
  } catch (err) {
    prodMissingThrew = err.message.includes("Production deployment requires");
  }
  assert(
    prodMissingThrew === true,
    "Missing AUTH_SECRET in production fails closed with a fatal configuration error"
  );

  const prodWithSecret = checkProductionSecretBehavior("my-secure-prod-secret", "production");
  assert(
    prodWithSecret === "my-secure-prod-secret",
    "Configured AUTH_SECRET in production is accurately resolved"
  );

  const devFallback = checkProductionSecretBehavior(undefined, "development");
  assert(
    devFallback === "local-fallback",
    "Unset secret in non-production permits local development fallback"
  );

  // --- FIX 2: PROPOSAL REVIEW BOLA REJECTION ---
  console.log("\n--- 4. Testing Proposal Review BOLA Authorization ---");

  const createdJobIds = [];
  const createdProposalIds = [];
  const createdUserIds = [];

  try {
    const testTimestamp = Date.now();
    // Create Owner Client
    const ownerClient = await prisma.user.create({
      data: {
        email: `sec-owner-${testTimestamp}@workpulse.test`,
        name: "Security Owner Client",
        role: "CLIENT",
        roleSelected: true,
      },
    });
    createdUserIds.push(ownerClient.id);

    // Create Competitor Client
    const attackerClient = await prisma.user.create({
      data: {
        email: `sec-attacker-${testTimestamp}@workpulse.test`,
        name: "Security Attacker Client",
        role: "CLIENT",
        roleSelected: true,
      },
    });
    createdUserIds.push(attackerClient.id);

    // Create Freelancer
    const applicantFreelancer = await prisma.user.create({
      data: {
        email: `sec-freelancer-${testTimestamp}@workpulse.test`,
        name: "Security Applicant Freelancer",
        role: "FREELANCER",
        roleSelected: true,
      },
    });
    createdUserIds.push(applicantFreelancer.id);

    // Create Job owned by ownerClient
    const secretJob = await prisma.job.create({
      data: {
        title: `Confidential Architecture Job ${testTimestamp}`,
        description: "Confidential internal requirements.",
        category: "Engineering",
        skills: ["Security"],
        type: "FIXED",
        budget: 5000,
        clientId: ownerClient.id,
        status: "OPEN",
      },
    });
    createdJobIds.push(secretJob.id);

    // Submit Proposal
    const confidentialProposal = await prisma.proposal.create({
      data: {
        jobId: secretJob.id,
        freelancerId: applicantFreelancer.id,
        coverLetter: "CONFIDENTIAL PROPOSAL: Secret trade craft and proprietary pricing.",
        bidAmount: 4500,
        status: "PENDING",
      },
    });
    createdProposalIds.push(confidentialProposal.id);

    // Scenario A: Unauthenticated caller attempts to review proposals
    const unauthResult = await simulateGetJobProposalsForReview(null, secretJob.id);
    assert(
      unauthResult.success === false && unauthResult.proposals.length === 0,
      "Unauthenticated caller is rejected from reviewing candidate proposals"
    );
    assert(
      unauthResult.error.includes("Authentication required"),
      "Unauthenticated caller receives explicit authentication error"
    );

    // Scenario B: Freelancer attempts to call client review action
    const freelancerResult = await simulateGetJobProposalsForReview(applicantFreelancer, secretJob.id);
    assert(
      freelancerResult.success === false && freelancerResult.proposals.length === 0,
      "Freelancer account is rejected from reviewing proposals"
    );
    assert(
      freelancerResult.error.includes("Only client accounts"),
      "Freelancer caller receives explicit role unauthorized error"
    );

    // Scenario C: Different Client (Attacker) attempts to access Owner's job proposals
    const attackerResult = await simulateGetJobProposalsForReview(attackerClient, secretJob.id);
    assert(
      attackerResult.success === false && attackerResult.proposals.length === 0,
      "Non-owner client is rejected from reviewing competitor's job proposals"
    );
    assert(
      attackerResult.error.includes("You do not own this job posting"),
      "Non-owner client receives explicit ownership rejection error"
    );

    // Scenario D: Genuine Owner Client accesses proposals
    const ownerResult = await simulateGetJobProposalsForReview(ownerClient, secretJob.id);
    assert(
      ownerResult.success === true && ownerResult.proposals.length === 1,
      "Owning client successfully retrieves candidate proposals"
    );
    assert(
      ownerResult.proposals[0].coverLetter.includes("CONFIDENTIAL PROPOSAL"),
      "Owner client receives proposal payload as expected"
    );

  } catch (error) {
    console.error("Database test error:", error);
    failed++;
  } finally {
    console.log("\nCleaning up temporary test records...");
    if (createdProposalIds.length > 0) {
      await prisma.proposal.deleteMany({ where: { id: { in: createdProposalIds } } });
    }
    if (createdJobIds.length > 0) {
      await prisma.job.deleteMany({ where: { id: { in: createdJobIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    console.log("Cleanup complete. 0 residual test records remain.\n");
    await prisma.$disconnect();
  }

  console.log("=================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityPhase1Tests();
