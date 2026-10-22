import { PrismaClient } from "@prisma/client";

/**
 * Reusable server-only PrismaClient instance.
 * Attaches to globalThis in development to prevent connection exhaustion
 * during Next.js Turbopack Fast Refresh cycles.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
