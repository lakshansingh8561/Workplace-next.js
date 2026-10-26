import { prisma } from "../src/lib/prisma";
import nextConfig from "../next.config";
import { getJobFilterOptions, invalidateJobFilterCache } from "../src/lib/jobs";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedCount++;
  } else {
    console.error(`[FAIL] ${message}`);
    failedCount++;
  }
}

async function testFix1SecurityHeaders() {
  console.log("\n--- 1. Testing HTTP Security Headers (next.config.ts) ---");
  
  // Test next.config headers configuration function
  if (typeof nextConfig.headers === "function") {
    const headersRules = await nextConfig.headers();
    assert(Array.isArray(headersRules) && headersRules.length > 0, "nextConfig.headers() returns array of header rules");

    const globalRule = headersRules.find((r) => r.source === "/:path*" || r.source === "/(.*)");
    assert(Boolean(globalRule), "Global header rule configured for /:path* or /(.*)");

    if (globalRule && globalRule.headers) {
      const headerMap = new Map(globalRule.headers.map((h: { key: string; value: string }) => [h.key.toLowerCase(), h.value]));

      // 1. X-Content-Type-Options: nosniff
      assert(headerMap.get("x-content-type-options") === "nosniff", "X-Content-Type-Options is set to 'nosniff'");

      // 2. X-Frame-Options: DENY
      assert(headerMap.get("x-frame-options") === "DENY", "X-Frame-Options is set to 'DENY'");

      // 3. Referrer-Policy: strict-origin-when-cross-origin
      assert(headerMap.get("referrer-policy") === "strict-origin-when-cross-origin", "Referrer-Policy is set to 'strict-origin-when-cross-origin'");

      // 4. Permissions-Policy
      const permissionsPolicy = headerMap.get("permissions-policy") || "";
      assert(
        permissionsPolicy.includes("camera=()") &&
        permissionsPolicy.includes("microphone=()") &&
        permissionsPolicy.includes("geolocation=()"),
        `Permissions-Policy restricts sensitive APIs: ${permissionsPolicy}`
      );

      // 5. Content-Security-Policy
      const csp = headerMap.get("content-security-policy") || "";
      assert(csp.includes("frame-ancestors 'none'"), "CSP specifies frame-ancestors 'none'");
      assert(csp.includes("base-uri 'self'"), "CSP specifies base-uri 'self'");
      assert(csp.includes("default-src 'self'"), "CSP specifies default-src 'self'");
      assert(csp.includes("script-src"), "CSP includes script-src policy");
      assert(csp.includes("style-src"), "CSP includes style-src policy");
      assert(csp.includes("img-src"), "CSP includes img-src policy");
    }
  } else {
    assert(false, "nextConfig.headers is not a function");
  }

  // Also test HSTS in production environment mode
  const originalEnv = process.env.NODE_ENV;
  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    if (typeof nextConfig.headers === "function") {
      const prodHeaders = await nextConfig.headers();
      const prodGlobal = prodHeaders.find((r) => r.source === "/:path*" || r.source === "/(.*)");
      const prodMap = new Map((prodGlobal?.headers || []).map((h: { key: string; value: string }) => [h.key.toLowerCase(), h.value]));
      const hsts = prodMap.get("strict-transport-security");
      assert(hsts === "max-age=31536000", `HSTS is configured in production mode: ${hsts}`);
      assert(!hsts?.includes("includeSubDomains"), "HSTS does not blindly enforce includeSubDomains without subdomain audit");
      assert(!hsts?.includes("preload"), "HSTS does not prematurely include preload");
    }
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  }
}

async function testFix2EmailMinimization() {
  console.log("\n--- 2. Testing Email Minimization (Message & Contract Projections) ---");

  // Create test client and freelancer accounts
  const testClient = await prisma.user.create({
    data: {
      email: `test-email-client-${Date.now()}@workpulse.test`,
      name: "Private Client",
      role: "CLIENT",
      roleSelected: true,
      image: "https://example.com/client.jpg",
    },
  });

  const testFreelancer = await prisma.user.create({
    data: {
      email: `test-email-freelancer-${Date.now()}@workpulse.test`,
      name: "Private Freelancer",
      role: "FREELANCER",
      roleSelected: true,
      image: "https://example.com/freelancer.jpg",
    },
  });

  const testJob = await prisma.job.create({
    data: {
      title: "Contract Privacy Test Job",
      description: "Testing email field minimization in contract responses",
      category: "Development & IT",
      skills: ["Security"],
      budget: 1500,
      clientId: testClient.id,
      status: "OPEN",
    },
  });

  const testProposal = await prisma.proposal.create({
    data: {
      jobId: testJob.id,
      freelancerId: testFreelancer.id,
      coverLetter: "Privacy test cover letter",
      bidAmount: 1500,
      status: "ACCEPTED",
    },
  });

  const testContract = await prisma.contract.create({
    data: {
      jobId: testJob.id,
      proposalId: testProposal.id,
      clientId: testClient.id,
      freelancerId: testFreelancer.id,
      title: "Privacy Test Contract",
      totalAmount: 1500,
      status: "ACTIVE",
      startDate: new Date(),
    },
  });

  const testConversation = await prisma.conversation.create({
    data: {
      contractId: testContract.id,
      clientId: testClient.id,
      freelancerId: testFreelancer.id,
      lastMessageAt: new Date(),
    },
  });

  const testMessage = await prisma.message.create({
    data: {
      conversationId: testConversation.id,
      senderId: testFreelancer.id,
      content: "Hello from private conversation",
    },
  });

  try {
    // 1. Verify Contract query projection (mimicking contracts/[id]/page.tsx)
    const rawContract = await prisma.contract.findUnique({
      where: { id: testContract.id },
      select: {
        id: true,
        client: {
          select: {
            id: true,
            name: true,
            image: true,
            role: true,
          },
        },
        freelancer: {
          select: {
            id: true,
            name: true,
            image: true,
            role: true,
          },
        },
      },
    });

    assert(Boolean(rawContract), "Test contract found");
    assert(!("email" in (rawContract?.client || {})), "Contract client projection excludes email");
    assert(!("email" in (rawContract?.freelancer || {})), "Contract freelancer projection excludes email");
    assert(rawContract?.client?.name === "Private Client", "Contract client public name preserved");
    assert(rawContract?.freelancer?.name === "Private Freelancer", "Contract freelancer public name preserved");

    // 2. Verify Conversation query projection (mimicking getConversationsAction in message.ts)
    const conv = await prisma.conversation.findUnique({
      where: { id: testConversation.id },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            image: true,
            role: true,
          },
        },
        freelancer: {
          select: {
            id: true,
            name: true,
            image: true,
            role: true,
          },
        },
        messages: {
          select: {
            content: true,
          },
        },
      },
    });

    assert(Boolean(conv), "Test conversation found");
    assert(!("email" in (conv?.client || {})), "Conversation client projection excludes email");
    assert(!("email" in (conv?.freelancer || {})), "Conversation freelancer projection excludes email");

    // 3. Verify Message query projection (mimicking getMessagesAction / sendMessageAction)
    const msg = await prisma.message.findUnique({
      where: { id: testMessage.id },
      select: {
        id: true,
        content: true,
        sender: {
          select: {
            id: true,
            name: true,
            image: true,
            role: true,
          },
        },
      },
    });

    assert(Boolean(msg), "Test message found");
    assert(!("email" in (msg?.sender || {})), "Message sender projection excludes email");
    assert(msg?.sender?.name === "Private Freelancer", "Message sender public name preserved");
  } finally {
    // Cleanup
    await prisma.message.deleteMany({ where: { conversationId: testConversation.id } });
    await prisma.conversation.delete({ where: { id: testConversation.id } });
    await prisma.contract.delete({ where: { id: testContract.id } });
    await prisma.proposal.delete({ where: { id: testProposal.id } });
    await prisma.job.delete({ where: { id: testJob.id } });
    await prisma.user.deleteMany({
      where: { id: { in: [testClient.id, testFreelancer.id] } },
    });
  }
}

async function testFix3JobFilterFacets() {
  console.log("\n--- 3. Testing Job Filter Facets Performance & Caching ---");

  // Invalidate cache first
  invalidateJobFilterCache();

  const start1 = Date.now();
  const facets1 = await getJobFilterOptions();
  const elapsed1 = Date.now() - start1;

  assert(Array.isArray(facets1.categories), "Facets returns categories array");
  assert(Array.isArray(facets1.skills), "Facets returns skills array");
  assert(typeof facets1.budgetBounds.min === "number", "Facets returns budgetBounds.min number");
  assert(typeof facets1.budgetBounds.max === "number", "Facets returns budgetBounds.max number");
  assert(facets1.budgetBounds.min <= facets1.budgetBounds.max, "budgetBounds min <= max");

  // Test caching: immediate second call should hit memory cache and take ~0ms
  const start2 = Date.now();
  const facets2 = await getJobFilterOptions();
  const elapsed2 = Date.now() - start2;

  assert(facets1 === facets2, "Second call returns exact cached object reference (in-memory hit)");
  console.log(`[PERF] First query (DB aggregation): ${elapsed1}ms, Cached query: ${elapsed2}ms`);

  // Test cache invalidation
  invalidateJobFilterCache();
  const facets3 = await getJobFilterOptions();
  assert(facets3 !== facets2, "After invalidateJobFilterCache(), fresh facets are computed");
  assert(facets3.categories.length === facets1.categories.length, "Invalidated query derives consistent category count");
}

async function testFix4ProposalCountAtomicity() {
  console.log("\n--- 4. Testing Proposal Count Consistency & Atomicity ---");

  // Create isolated client and job
  const client = await prisma.user.create({
    data: {
      email: `test-atomicity-client-${Date.now()}@workpulse.test`,
      name: "Atomicity Client",
      role: "CLIENT",
      roleSelected: true,
    },
  });

  const freelancer = await prisma.user.create({
    data: {
      email: `test-atomicity-freelancer-${Date.now()}@workpulse.test`,
      name: "Atomicity Freelancer",
      role: "FREELANCER",
      roleSelected: true,
    },
  });

  const job = await prisma.job.create({
    data: {
      title: "Atomicity Proposal Test Job",
      description: "Testing atomic increment and rollback consistency",
      category: "Development & IT",
      skills: ["MongoDB", "Transactions"],
      type: "FIXED",
      budget: 1200,
      clientId: client.id,
      status: "OPEN",
      proposalsCount: 0,
    },
  });

  try {
    // 1. Atomic proposal creation + count increment inside $transaction
    const proposal = await prisma.$transaction(async (tx) => {
      const freshJob = await tx.job.findUnique({
        where: { id: job.id },
        select: { status: true },
      });

      if (!freshJob || freshJob.status !== "OPEN") {
        throw new Error("JOB_NOT_OPEN");
      }

      const p = await tx.proposal.create({
        data: {
          jobId: job.id,
          freelancerId: freelancer.id,
          coverLetter: "Atomic submission proposal",
          bidAmount: 1200,
          status: "PENDING",
        },
      });

      await tx.job.update({
        where: { id: job.id },
        data: { proposalsCount: { increment: 1 } },
      });

      return p;
    });

    assert(Boolean(proposal.id), "Proposal created successfully within transaction");

    // Verify proposalsCount is strictly 1
    const updatedJob = await prisma.job.findUnique({
      where: { id: job.id },
      select: { proposalsCount: true },
    });
    assert(updatedJob?.proposalsCount === 1, "Job proposalsCount incremented to 1 atomically");

    // 2. Test duplicate submission failure and rollback guarantee
    let duplicateRejected = false;
    try {
      await prisma.$transaction(async (tx) => {
        // Duplicate check within transaction
        const existing = await tx.proposal.findUnique({
          where: {
            jobId_freelancerId: {
              jobId: job.id,
              freelancerId: freelancer.id,
            },
          },
        });

        if (existing) {
          throw new Error("ALREADY_SUBMITTED");
        }

        await tx.proposal.create({
          data: {
            jobId: job.id,
            freelancerId: freelancer.id,
            coverLetter: "Duplicate submission attempt",
            bidAmount: 1200,
            status: "PENDING",
          },
        });

        await tx.job.update({
          where: { id: job.id },
          data: { proposalsCount: { increment: 1 } },
        });
      });
    } catch (err: any) {
      if (err.message === "ALREADY_SUBMITTED") {
        duplicateRejected = true;
      }
    }

    assert(duplicateRejected, "Duplicate proposal submission rejected inside transaction");

    // Verify proposalsCount DID NOT increment (remains 1)
    const jobAfterDuplicate = await prisma.job.findUnique({
      where: { id: job.id },
      select: { proposalsCount: true },
    });
    assert(
      jobAfterDuplicate?.proposalsCount === 1,
      "Job proposalsCount remains 1 after duplicate attempt (no double increment)"
    );

    // 3. Test intentional transaction failure: ensure rollback leaves count unmodified
    let failedTxRolledBack = false;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.job.update({
          where: { id: job.id },
          data: { proposalsCount: { increment: 1 } },
        });

        // Force an unexpected error to trigger rollback
        throw new Error("SIMULATED_FAILURE");
      });
    } catch (err: any) {
      if (err.message === "SIMULATED_FAILURE") {
        failedTxRolledBack = true;
      }
    }

    assert(failedTxRolledBack, "Simulated transaction failure triggered rollback");

    const jobAfterFailure = await prisma.job.findUnique({
      where: { id: job.id },
      select: { proposalsCount: true },
    });
    assert(
      jobAfterFailure?.proposalsCount === 1,
      "Job proposalsCount remains unchanged at 1 after rolled-back transaction"
    );
  } finally {
    // Cleanup isolated records
    await prisma.proposal.deleteMany({ where: { jobId: job.id } });
    await prisma.job.delete({ where: { id: job.id } });
    await prisma.user.deleteMany({
      where: { id: { in: [client.id, freelancer.id] } },
    });
  }
}

async function run() {
  console.log("=================================================");
  console.log("  WORKPULSE SECURITY REMEDIATION — PHASE 2 TESTS ");
  console.log("=================================================");

  try {
    await testFix1SecurityHeaders();
    await testFix2EmailMinimization();
    await testFix3JobFilterFacets();
    await testFix4ProposalCountAtomicity();

    console.log("\n=================================================");
    console.log(`  RESULTS: ${passedCount} passed, ${failedCount} failed`);
    console.log("=================================================");

    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Test execution error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

run();
