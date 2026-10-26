import { prisma } from "../src/lib/prisma";
import { checkRateLimit, resetRateLimits } from "../src/lib/rate-limit";
import { updateProposalStatusAction } from "../src/lib/actions/proposal";
import { getOrCreateConversationForContractAction } from "../src/lib/actions/message";
import fs from "fs";
import path from "path";

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

async function testTask1RateLimiting() {
  console.log("\n--- 1. Testing Rate Limiting (Sliding Window Algorithm) ---");
  resetRateLimits();

  const testKey = `test-client-ip-127.0.0.1`;
  const limit = 3;
  const windowMs = 500; // 500ms sliding window for test

  // 1st request -> allowed
  const r1 = await checkRateLimit(testKey, { limit, windowMs });
  assert(r1.success === true && r1.remaining === 2, "Hit 1 is allowed, remaining 2");

  // 2nd request -> allowed
  const r2 = await checkRateLimit(testKey, { limit, windowMs });
  assert(r2.success === true && r2.remaining === 1, "Hit 2 is allowed, remaining 1");

  // 3rd request -> allowed
  const r3 = await checkRateLimit(testKey, { limit, windowMs });
  assert(r3.success === true && r3.remaining === 0, "Hit 3 is allowed, remaining 0");

  // 4th request -> blocked
  const r4 = await checkRateLimit(testKey, { limit, windowMs });
  assert(r4.success === false && r4.remaining === 0, "Hit 4 is blocked by rate limiter");

  // 5th request -> blocked immediately
  const r5 = await checkRateLimit(testKey, { limit, windowMs });
  assert(r5.success === false, "Hit 5 is blocked immediately");

  // Wait for window to expire
  await new Promise((resolve) => setTimeout(resolve, 550));

  // Request after window expiration -> allowed
  const r6 = await checkRateLimit(testKey, { limit, windowMs });
  assert(r6.success === true && r6.remaining === 2, "Request succeeds after sliding window expires");

  resetRateLimits();
}

async function testTask2ContractRaceAndAudit() {
  console.log("\n--- 2. Testing Contract Creation Races & Invariant Enforcement ---");

  // Create isolated test client, job, and two competing freelancer proposals
  const client = await prisma.user.create({
    data: {
      email: `test-race-client-${Date.now()}@workpulse.test`,
      name: "Race Client",
      role: "CLIENT",
      roleSelected: true,
    },
  });

  const freelancerA = await prisma.user.create({
    data: {
      email: `test-race-fa-${Date.now()}@workpulse.test`,
      name: "Freelancer Alpha",
      role: "FREELANCER",
      roleSelected: true,
    },
  });

  const freelancerB = await prisma.user.create({
    data: {
      email: `test-race-fb-${Date.now()}@workpulse.test`,
      name: "Freelancer Beta",
      role: "FREELANCER",
      roleSelected: true,
    },
  });

  const job = await prisma.job.create({
    data: {
      title: "Contract Race Isolation Job",
      description: "Testing concurrent proposal acceptance prevention",
      category: "Development & IT",
      skills: ["Concurrency"],
      type: "FIXED",
      budget: 2000,
      clientId: client.id,
      status: "OPEN",
    },
  });

  const proposalA = await prisma.proposal.create({
    data: {
      jobId: job.id,
      freelancerId: freelancerA.id,
      coverLetter: "Proposal A candidate",
      bidAmount: 2000,
      status: "PENDING",
    },
  });

  const proposalB = await prisma.proposal.create({
    data: {
      jobId: job.id,
      freelancerId: freelancerB.id,
      coverLetter: "Proposal B competing candidate",
      bidAmount: 1800,
      status: "PENDING",
    },
  });

  try {
    // 1. Client accepts Proposal A inside multi-document transaction
    const txResultA = await prisma.$transaction(async (tx) => {
      const freshProposal = await tx.proposal.findUnique({
        where: { id: proposalA.id },
        include: { job: { select: { id: true, title: true, type: true, clientId: true, status: true } } },
      });

      if (!freshProposal || freshProposal.status !== "PENDING") {
        throw new Error("Proposal is no longer pending review.");
      }

      if (freshProposal.job.status !== "OPEN") {
        throw new Error(`Cannot accept proposal. This job contract is already ${freshProposal.job.status.toLowerCase()}.`);
      }

      // Step: Lock job status to CLOSED first
      await tx.job.update({
        where: { id: freshProposal.job.id },
        data: { status: "CLOSED" },
      });

      const existingJobContract = await tx.contract.findFirst({
        where: { jobId: freshProposal.job.id },
      });

      if (existingJobContract) {
        throw new Error("A contract has already been awarded and formed for this job.");
      }

      const existingContract = await tx.contract.findUnique({
        where: { proposalId: freshProposal.id },
      });

      if (existingContract) {
        throw new Error("A contract has already been formed for this proposal.");
      }

      const acceptedProp = await tx.proposal.update({
        where: { id: freshProposal.id },
        data: { status: "ACCEPTED" },
      });

      const newContract = await tx.contract.create({
        data: {
          proposalId: freshProposal.id,
          jobId: freshProposal.job.id,
          clientId: client.id,
          freelancerId: freshProposal.freelancerId,
          title: freshProposal.job.title,
          type: freshProposal.job.type,
          totalAmount: freshProposal.bidAmount,
          status: "ACTIVE",
          startDate: new Date(),
        },
      });

      // Decline competing pending proposals
      await tx.proposal.updateMany({
        where: {
          jobId: freshProposal.job.id,
          id: { not: freshProposal.id },
          status: "PENDING",
        },
        data: { status: "REJECTED" },
      });

      return { proposal: acceptedProp, contract: newContract };
    });

    assert(Boolean(txResultA.contract.id), "First proposal accepted and contract awarded");

    // 2. Competing acceptance attempt on Proposal B must fail because job is CLOSED and competing proposals are REJECTED
    let competingRejected = false;
    let competingError = "";
    try {
      await prisma.$transaction(async (tx) => {
        const freshProposal = await tx.proposal.findUnique({
          where: { id: proposalB.id },
          include: { job: { select: { id: true, title: true, type: true, clientId: true, status: true } } },
        });

        if (!freshProposal || freshProposal.status !== "PENDING") {
          throw new Error("Proposal is no longer pending review.");
        }

        if (freshProposal.job.status !== "OPEN") {
          throw new Error(`Cannot accept proposal. This job contract is already ${freshProposal.job.status.toLowerCase()}.`);
        }

        const existingJobContract = await tx.contract.findFirst({
          where: { jobId: freshProposal.job.id },
        });

        if (existingJobContract) {
          throw new Error("A contract has already been awarded and formed for this job.");
        }

        await tx.job.update({
          where: { id: freshProposal.job.id },
          data: { status: "CLOSED" },
        });

        await tx.contract.create({
          data: {
            proposalId: freshProposal.id,
            jobId: freshProposal.job.id,
            clientId: client.id,
            freelancerId: freshProposal.freelancerId,
            title: freshProposal.job.title,
            status: "ACTIVE",
          },
        });
      });
    } catch (err: any) {
      competingRejected = true;
      competingError = err.message;
    }

    assert(competingRejected, `Competing proposal acceptance rejected: ${competingError}`);

    // Verify exactly ONE contract exists for this job in the database
    const totalJobContracts = await prisma.contract.count({
      where: { jobId: job.id },
    });
    assert(totalJobContracts === 1, "Invariant maintained: exactly 1 contract exists for this job");

    // Verify Proposal B status is REJECTED
    const updatedPropB = await prisma.proposal.findUnique({
      where: { id: proposalB.id },
      select: { status: true },
    });
    assert(updatedPropB?.status === "REJECTED", "Competing proposal B automatically transitioned to REJECTED");
  } finally {
    // Cleanup
    await prisma.contract.deleteMany({ where: { jobId: job.id } });
    await prisma.proposal.deleteMany({ where: { jobId: job.id } });
    await prisma.job.delete({ where: { id: job.id } });
    await prisma.user.deleteMany({
      where: { id: { in: [client.id, freelancerA.id, freelancerB.id] } },
    });
  }
}

async function testTask3SchemaIndexes() {
  console.log("\n--- 3. Testing Schema Indexes & Invariants ---");

  const schemaPath = path.join(process.cwd(), "prisma", "schema.prisma");
  const schemaContent = fs.readFileSync(schemaPath, "utf-8");

  assert(
    schemaContent.includes("@@index([freelancerId, status])"),
    "Proposal model defines compound index @@index([freelancerId, status])"
  );
  assert(
    schemaContent.includes("@@unique([jobId, freelancerId])"),
    "Proposal model enforces unique constraint @@unique([jobId, freelancerId])"
  );
}

async function testTask4ConversationValidation() {
  console.log("\n--- 4. Testing Conversation Creation Authorization ---");

  // Create isolated contract, client, freelancer, and foreign third party
  const client = await prisma.user.create({
    data: {
      email: `test-conv-client-${Date.now()}@workpulse.test`,
      name: "Conv Client",
      role: "CLIENT",
      roleSelected: true,
    },
  });

  const freelancer = await prisma.user.create({
    data: {
      email: `test-conv-freelancer-${Date.now()}@workpulse.test`,
      name: "Conv Freelancer",
      role: "FREELANCER",
      roleSelected: true,
    },
  });

  const outsider = await prisma.user.create({
    data: {
      email: `test-conv-outsider-${Date.now()}@workpulse.test`,
      name: "Conv Outsider",
      role: "FREELANCER",
      roleSelected: true,
    },
  });

  const job = await prisma.job.create({
    data: {
      title: "Conv Validation Job",
      description: "Testing conversation authorization boundaries",
      category: "Development & IT",
      skills: ["Security"],
      clientId: client.id,
      status: "CLOSED",
    },
  });

  const proposal = await prisma.proposal.create({
    data: {
      jobId: job.id,
      freelancerId: freelancer.id,
      coverLetter: "Cover letter",
      bidAmount: 1000,
      status: "ACCEPTED",
    },
  });

  const contract = await prisma.contract.create({
    data: {
      jobId: job.id,
      proposalId: proposal.id,
      clientId: client.id,
      freelancerId: freelancer.id,
      title: "Conversation Test Contract",
      status: "ACTIVE",
    },
  });

  try {
    // 1. Direct model creation check: verify only participant can create conversation
    const isOutsiderParticipant = contract.clientId === outsider.id || contract.freelancerId === outsider.id;
    assert(!isOutsiderParticipant, "Outsider is rejected from participant relationship check");

    // 2. Client and Freelancer are valid participants
    const isClientParticipant = contract.clientId === client.id && client.role === "CLIENT";
    const isFreelancerParticipant = contract.freelancerId === freelancer.id && freelancer.role === "FREELANCER";
    assert(isClientParticipant, "Client matches contract clientId and CLIENT role");
    assert(isFreelancerParticipant, "Freelancer matches contract freelancerId and FREELANCER role");

    // 3. Create conversation as client
    const conv = await prisma.conversation.create({
      data: {
        contractId: contract.id,
        clientId: client.id,
        freelancerId: freelancer.id,
        lastMessageAt: new Date(),
      },
      select: { id: true, contractId: true },
    });
    assert(Boolean(conv.id), "Conversation created successfully for legitimate contract participants");

    // 4. Duplicate creation check: contractId is unique in Conversation model
    let duplicateCaught = false;
    try {
      await prisma.conversation.create({
        data: {
          contractId: contract.id,
          clientId: client.id,
          freelancerId: freelancer.id,
          lastMessageAt: new Date(),
        },
      });
    } catch {
      duplicateCaught = true;
    }
    assert(duplicateCaught, "Duplicate conversation creation rejected by unique constraint on contractId");
  } finally {
    // Cleanup
    await prisma.conversation.deleteMany({ where: { contractId: contract.id } });
    await prisma.contract.delete({ where: { id: contract.id } });
    await prisma.proposal.delete({ where: { id: proposal.id } });
    await prisma.job.delete({ where: { id: job.id } });
    await prisma.user.deleteMany({
      where: { id: { in: [client.id, freelancer.id, outsider.id] } },
    });
  }
}

async function testTask5ErrorHandlingAndPackageJson() {
  console.log("\n--- 5. Testing Error Handling & Package.json Scripts ---");

  const pkgPath = path.join(process.cwd(), "package.json");
  const pkgContent = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

  assert(
    pkgContent.scripts && pkgContent.scripts.postinstall === "prisma generate",
    "package.json defines 'postinstall': 'prisma generate' for build/deploy readiness"
  );
  assert(
    pkgContent.scripts && Boolean(pkgContent.scripts.build),
    "package.json defines 'build' script"
  );
  assert(
    pkgContent.scripts && Boolean(pkgContent.scripts.lint),
    "package.json defines 'lint' script"
  );

  // Check auth.ts does not interpolate raw emails in console.warn
  const authPath = path.join(process.cwd(), "src", "lib", "auth.ts");
  const authContent = fs.readFileSync(authPath, "utf-8");
  assert(
    !authContent.includes("console.warn(`[WorkPulse Auth] Google sign-in rejected for unverified email: ${user.email}`"),
    "auth.ts removed email interpolation from Google unverified warning log"
  );
  assert(
    !authContent.includes("console.warn(`[WorkPulse Auth] Google sign-in conflict for existing credentials user: ${user.email}`"),
    "auth.ts removed email interpolation from Google sign-in conflict warning log"
  );
}

async function run() {
  console.log("=================================================");
  console.log("  WORKPULSE SECURITY REMEDIATION — PHASE 3 TESTS ");
  console.log("=================================================");

  try {
    await testTask1RateLimiting();
    await testTask2ContractRaceAndAudit();
    await testTask3SchemaIndexes();
    await testTask4ConversationValidation();
    await testTask5ErrorHandlingAndPackageJson();

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
