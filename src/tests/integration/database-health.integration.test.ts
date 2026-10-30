// src/tests/integration/database-health.integration.test.ts
import { describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";

const isIntegrationRun = process.env.WORKPULSE_INTEGRATION_RUN === "true";
const testDbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || "";

describe("WorkPulse Database Integration Health Check", () => {
  if (!isIntegrationRun) {
    it.skip("skips database integration test during standard unit test run (run 'npm run test:integration')", () => {
      // Intentionally skipped during unit tests
    });
    return;
  }

  it("verifies dedicated test database is configured and local", () => {
    expect(testDbUrl).toBeTruthy();
    expect(testDbUrl.toLowerCase()).toContain("test");
    expect(testDbUrl.toLowerCase()).not.toContain("mongodb.net");
  });

  it("successfully connects to the test database and responds to ping", async () => {
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: testDbUrl,
        },
      },
    });

    try {
      // Execute raw ping command on MongoDB
      const pingResult = await prisma.$runCommandRaw({ ping: 1 });
      expect(pingResult).toHaveProperty("ok");
    } finally {
      await prisma.$disconnect();
    }
  });

  it("verifies user collection query executes safely on test database", async () => {
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: testDbUrl,
        },
      },
    });

    try {
      // Non-destructive read check
      const count = await prisma.user.count();
      expect(typeof count).toBe("number");
      expect(count).toBeGreaterThanOrEqual(0);
    } finally {
      await prisma.$disconnect();
    }
  });
});
