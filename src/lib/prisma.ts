import { PrismaClient } from "@prisma/client";

/**
 * Reusable server-only PrismaClient instance.
 * Attaches to globalThis in development to prevent connection exhaustion
 * during Next.js Turbopack Fast Refresh cycles.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  let ClientClass = PrismaClient;

  // If in development and the loaded PrismaClient class lacks the savedJob delegate,
  // bust Node's require.cache so the newly generated client on disk is loaded.
  if (
    process.env.NODE_ENV !== "production" &&
    typeof require !== "undefined" &&
    typeof require.cache !== "undefined"
  ) {
    const probe = new ClientClass();
    const probeRecord = probe as unknown as { savedJob?: unknown; review?: unknown };
    if (
      typeof probeRecord.savedJob === "undefined" ||
      typeof probeRecord.review === "undefined"
    ) {
      Object.keys(require.cache).forEach((key) => {
        if (key.includes(".prisma") || key.includes("@prisma")) {
          delete require.cache[key];
        }
      });
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const freshModule = require("@prisma/client");
        ClientClass = freshModule.PrismaClient;
      } catch {
        // Fallback to original import
      }
    }
  }

  return new ClientClass({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function getValidPrismaClient(): PrismaClient {
  const cached = globalForPrisma.prisma;
  const cachedRecord = cached as unknown as { savedJob?: unknown; review?: unknown };
  // If in development and the cached global instance lacks newly generated models (e.g. savedJob, review),
  // discard it and re-instantiate from the updated generated @prisma/client.
  const isStale = Boolean(
    cached &&
      (typeof cachedRecord.savedJob === "undefined" ||
        typeof cachedRecord.review === "undefined")
  );

  if (cached && !isStale) {
    return cached;
  }

  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getValidPrismaClient();
    const value = Reflect.get(client, prop);
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});

