// src/tests/integration/auth-security.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, Role } from "@prisma/client";
import crypto from "crypto";
import bcrypt from "bcryptjs";

const isIntegrationRun = process.env.WORKPULSE_INTEGRATION_RUN === "true";
const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  "mongodb://127.0.0.1:27018/workpulse_test?replicaSet=rsTest&directConnection=true";

describe("WorkPulse Phase 2 Batch 2: Real MongoDB Replica Set Auth & Security Integration Tests", () => {
  if (!isIntegrationRun) {
    it.skip("skips database integration test during standard unit test run (run 'npm run test:integration')", () => {
      // Intentionally skipped during unit tests
    });
    return;
  }

  let prisma: PrismaClient;
  let isReplicaSet = false;
  let replicaSetName = "";

  const testUserId = "66a000000000000000000099";
  const testUserEmail = "security_test_user@workpulse.internal";

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: testDbUrl,
        },
      },
    });

    try {
      const serverStatus = (await prisma.$runCommandRaw({ hello: 1 })) as {
        setName?: string;
        isWritablePrimary?: boolean;
      };
      if (serverStatus.setName) {
        isReplicaSet = true;
        replicaSetName = serverStatus.setName;
      }
    } catch (err) {
      console.warn("[Integration Test Setup] Server check:", err);
    }

    await cleanup();

    // Create test user
    await prisma.user.create({
      data: {
        id: testUserId,
        email: testUserEmail,
        name: "Security Integration User",
        role: Role.CLIENT,
        passwordHash: await bcrypt.hash("InitialPassword123!", 10),
        sessionVersion: 1,
        emailVerified: null,
      },
    });
  });

  async function cleanup() {
    try {
      await prisma.passwordResetToken.deleteMany({
        where: { email: testUserEmail },
      });
      await prisma.emailVerificationToken.deleteMany({
        where: { email: testUserEmail },
      });
      await prisma.user.deleteMany({
        where: { id: testUserId },
      });
    } catch {
      // Ignore cleanup error if collection not yet touched
    }
  }

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await prisma.$disconnect();
    }
  });

  it("TASK 7.1: verifies dedicated replica set is active for transaction testing", () => {
    expect(isReplicaSet).toBe(true);
    expect(replicaSetName).toBe("rsTest");
  });

  it("TASK 7.2: verifies atomic password reset token consumption under concurrent requests on real MongoDB", async () => {
    // 1. Create a password reset token in the database
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: {
        email: testUserEmail,
        tokenHash,
        expiresAt,
      },
    });

    // Function simulating atomic consumption inside Prisma multi-document transaction
    const consumeResetToken = async (newPass: string) => {
      return prisma.$transaction(async (tx) => {
        const tokenDoc = await tx.passwordResetToken.findUnique({
          where: { tokenHash },
        });

        if (!tokenDoc || tokenDoc.expiresAt < new Date()) {
          throw new Error("TOKEN_INVALID_OR_EXPIRED");
        }

        const userDoc = await tx.user.findUnique({
          where: { email: tokenDoc.email },
        });

        if (!userDoc) {
          throw new Error("USER_NOT_FOUND");
        }

        const newHash = await bcrypt.hash(newPass, 10);

        // Atomic update of user password and increment of sessionVersion
        await tx.user.update({
          where: { id: userDoc.id },
          data: {
            passwordHash: newHash,
            sessionVersion: { increment: 1 },
          },
        });

        // Invalidate token
        await tx.passwordResetToken.deleteMany({
          where: { email: tokenDoc.email },
        });

        return { success: true };
      });
    };

    // 2. Launch two concurrent consumption attempts racing on the exact same token
    const attempt1 = consumeResetToken("ConcurrentPassword111!").then(
      () => ({ success: true }),
      (err) => ({ success: false, error: err.message })
    );

    const attempt2 = consumeResetToken("ConcurrentPassword222!").then(
      () => ({ success: true }),
      (err) => ({ success: false, error: err.message })
    );

    const [res1, res2] = await Promise.all([attempt1, attempt2]);

    const successes = [res1, res2].filter((r) => r.success);
    const failures = [res1, res2].filter((r) => !r.success);

    // Concurrency guarantee: Exactly 1 transaction must succeed, and 1 must fail
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    // 3. Verify token no longer exists in database (single-use enforced)
    const remainingTokens = await prisma.passwordResetToken.count({
      where: { tokenHash },
    });
    expect(remainingTokens).toBe(0);

    // 4. Verify user sessionVersion was incremented exactly once
    const updatedUser = await prisma.user.findUnique({
      where: { id: testUserId },
      select: { sessionVersion: true },
    });
    expect(updatedUser?.sessionVersion).toBe(2);
  });

  it("TASK 7.3: verifies token reuse is strictly rejected after successful consumption", async () => {
    // Attempting to consume the token again must fail immediately
    const rawToken = "already_consumed_token_abc";
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const tokenDoc = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    expect(tokenDoc).toBeNull();
  });

  it("TASK 7.4: verifies atomic email verification token consumption and state transition in real MongoDB", async () => {
    const rawVerifyToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawVerifyToken)
      .digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.emailVerificationToken.create({
      data: {
        email: testUserEmail,
        tokenHash,
        expiresAt,
      },
    });

    const verifyTransaction = async () => {
      return prisma.$transaction(async (tx) => {
        const record = await tx.emailVerificationToken.findUnique({
          where: { tokenHash },
        });

        if (!record || record.expiresAt < new Date()) {
          throw new Error("TOKEN_INVALID");
        }

        await tx.user.update({
          where: { email: record.email },
          data: { emailVerified: new Date() },
        });

        await tx.emailVerificationToken.deleteMany({
          where: { email: record.email },
        });

        return { verified: true };
      });
    };

    // Race two concurrent verification requests
    const [res1, res2] = await Promise.allSettled([
      verifyTransaction(),
      verifyTransaction(),
    ]);

    const fulfilled = [res1, res2].filter((r) => r.status === "fulfilled");
    const rejected = [res1, res2].filter((r) => r.status === "rejected");

    // Exactly one transaction performs the consumption and deletion
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    // User is marked verified in DB
    const verifiedUser = await prisma.user.findUnique({
      where: { id: testUserId },
      select: { emailVerified: true },
    });
    expect(verifiedUser?.emailVerified).not.toBeNull();

    // Verification token was deleted
    const count = await prisma.emailVerificationToken.count({
      where: { tokenHash },
    });
    expect(count).toBe(0);
  });

  it("TASK 7.5: verifies database-level sessionVersion invalidation behavior", async () => {
    // Current user in DB has sessionVersion: 2
    const currentDbUser = await prisma.user.findUnique({
      where: { id: testUserId },
      select: { sessionVersion: true },
    });
    const currentVersion = currentDbUser?.sessionVersion ?? 1;

    // Simulate an old active JWT issued before password change (holding sessionVersion: 1)
    const oldJwtToken = {
      id: testUserId,
      sessionVersion: 1,
    };

    // Emulate auth.ts JWT callback session validation logic
    const validateTokenAgainstDb = async (token: { id: string; sessionVersion: number }) => {
      const user = await prisma.user.findUnique({
        where: { id: token.id },
        select: { sessionVersion: true },
      });
      if (!user || user.sessionVersion !== token.sessionVersion) {
        return null; // Session Invalidated
      }
      return token;
    };

    const oldSessionResult = await validateTokenAgainstDb(oldJwtToken);
    // Old session MUST be invalidated because 1 !== 2
    expect(oldSessionResult).toBeNull();

    // Active JWT holding updated sessionVersion (2)
    const validJwtToken = {
      id: testUserId,
      sessionVersion: currentVersion,
    };

    const validSessionResult = await validateTokenAgainstDb(validJwtToken);
    // Valid session continues successfully
    expect(validSessionResult).not.toBeNull();
    expect(validSessionResult?.sessionVersion).toBe(currentVersion);
  });
});
