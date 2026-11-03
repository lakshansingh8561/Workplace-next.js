/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient } from "@prisma/client";

async function main() {
  const isTest = process.env.NODE_ENV === "test" || Boolean(process.env.TEST_DATABASE_URL);
  const dbUrl = isTest
    ? process.env.TEST_DATABASE_URL || "mongodb://127.0.0.1:27018/workpulse_test?replicaSet=rsTest&directConnection=true"
    : process.env.DATABASE_URL;

  console.log(`[WorkPulse Backfill] Running conversation audit & backfill against target DB...`);

  const prisma = new PrismaClient({
    datasources: {
      db: { url: dbUrl },
    },
  });

  try {
    // 1. Fetch all conversations with their contracts
    const conversations = await prisma.conversation.findMany({
      include: {
        contract: {
          select: {
            id: true,
            jobId: true,
            clientId: true,
            freelancerId: true,
          },
        },
      },
    });

    console.log(`[WorkPulse Backfill] Found ${conversations.length} total conversation records.`);

    let backfilledCount = 0;
    const seenPairs = new Set<string>();
    const duplicatePairs: string[] = [];

    for (const conv of conversations) {
      // Determine effective jobId
      let effectiveJobId = (conv as any).jobId;

      if (!effectiveJobId && conv.contract?.jobId) {
        effectiveJobId = conv.contract.jobId;
        // Perform safe non-destructive update
        await prisma.conversation.update({
          where: { id: conv.id },
          data: {
            jobId: effectiveJobId,
            type: "CONTRACT",
          } as any,
        });
        backfilledCount++;
      }

      if (effectiveJobId) {
        const key = `${effectiveJobId}_${conv.freelancerId}`;
        if (seenPairs.has(key)) {
          duplicatePairs.push(`Pair: ${key} (Conv: ${conv.id})`);
        } else {
          seenPairs.add(key);
        }
      }
    }

    console.log(`[WorkPulse Backfill] Backfill complete. Updated ${backfilledCount} conversations with missing jobId.`);
    console.log(`[WorkPulse Backfill] Uniqueness Audit: ${duplicatePairs.length} duplicate (jobId, freelancerId) pairs found.`);

    if (duplicatePairs.length > 0) {
      console.warn(`[WorkPulse Backfill Warning] Duplicate pairs detected:`, duplicatePairs);
    } else {
      console.log(`[WorkPulse Backfill] All conversations satisfy the @@unique([jobId, freelancerId]) constraint!`);
    }
  } catch (err: any) {
    console.error(`[WorkPulse Backfill Error]:`, err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
