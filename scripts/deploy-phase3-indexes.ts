/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WorkPulse Phase 3 Batch 2: Production Index Deployment Script
 *
 * SAFETY GUARD:
 * This script will NOT execute against any database unless explicitly invoked with the `--confirm-production` flag.
 *
 * Safety Protocol:
 * 1. Pre-flight Index Inspection: Inspects existing index catalog on "conversations" and "interview_invitations".
 * 2. Pre-flight Uniqueness Validation: Verifies zero duplicate (jobId, freelancerId) pairs before attempting unique constraint creation.
 * 3. Partial Unique Index for contractId: Deploys { contractId: 1 } with `partialFilterExpression: { contractId: { $type: "objectId" } }`
 *    instead of a naive sparse index. In MongoDB, sparse indexes index explicit null values ({ contractId: null }).
 *    The partialFilterExpression guarantees that null and missing values are never indexed, eliminating write conflicts
 *    for pre-hire conversations while strictly guaranteeing 1-to-1 uniqueness for contracts.
 * 4. Idempotent & Zero-Downtime: If an index already exists with the matching definition, it is preserved without dropping.
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const args = process.argv.slice(2);
  const isConfirmed = args.includes("--confirm-production");

  if (!isConfirmed) {
    console.log(`
=============================================================================
WorkPulse Phase 3 Production Index Deployment Plan (DRY RUN)
=============================================================================
This script inspects, audits, and safely deploys the unique constraints and
performance indexes required for Phase 3: Pre-Hire Conversations & Invitations.

To apply these indexes to the target database, run:
  npx tsx scripts/deploy-phase3-indexes.ts --confirm-production

INDEX SPECIFICATIONS & INTENT:
1. Collection: "conversations"
   - Key: { jobId: 1, freelancerId: 1 }
     Name: "conversations_jobId_freelancerId_unique"
     Unique: true
     Purpose: Enforces at most one conversation thread per job/freelancer pair.

   - Key: { contractId: 1 }
     Name: "conversations_contractId_key"
     Unique: true
     PartialFilterExpression: { contractId: { $type: "objectId" } }
     Purpose: Safely replaces legacy non-partial index. Prevents index entry
              for null/missing contractId, allowing multiple pre-hire conversations
              while strictly enforcing 1-to-1 uniqueness for contracts.

2. Collection: "interview_invitations"
   - Key: { jobId: 1, freelancerId: 1 }
     Name: "invitations_jobId_freelancerId_unique"
     Unique: true
     Purpose: Enforces at most one invitation per job/freelancer pair for MVP.

   - Key: { freelancerId: 1, status: 1 }
     Name: "invitations_freelancerId_status_idx"
     Purpose: Optimizes freelancer invitation inbox retrieval.

   - Key: { clientId: 1, status: 1 }
     Name: "invitations_clientId_status_idx"
     Purpose: Optimizes client invitation management dashboard queries.

   - Key: { jobId: 1 }
     Name: "invitations_jobId_idx"
     Purpose: Optimizes invitation status checks when viewing job postings.

3. Collection: "notifications"
   - Key: { idempotencyKey: 1 }
     Name: "notifications_idempotencyKey_unique"
     Unique: true
     PartialFilterExpression: { idempotencyKey: { $type: "string" } }
     Purpose: Enforces database-level atomic event idempotency while safely
              omitting nulls and preserving existing historical notifications.

Exiting dry run. No changes were made.
=============================================================================
`);
    return;
  }

  const prisma = new PrismaClient();

  try {
    console.log("[Index Deploy] Starting deployment of Phase 3 indexes...");

    // ---------------------------------------------------------
    // Step 1: Pre-Flight Audit for "conversations"
    // ---------------------------------------------------------
    console.log("[Index Deploy] Step 1: Inspecting 'conversations' collection...");
    let existingConvIndexes: any[] = [];
    try {
      const res = (await prisma.$runCommandRaw({ listIndexes: "conversations" })) as any;
      existingConvIndexes = res?.cursor?.firstBatch || [];
    } catch {
      console.log("[Index Deploy] 'conversations' collection has no custom indexes yet.");
    }

    const convIndexMap = new Map<string, any>(existingConvIndexes.map((idx) => [idx.name, idx]));
    console.log(`[Index Deploy] Found ${existingConvIndexes.length} existing indexes on 'conversations'.`);

    // Pre-flight duplicate check on (jobId, freelancerId)
    console.log("[Index Deploy] Validating (jobId, freelancerId) uniqueness on existing conversations...");
    const convPairs = await prisma.conversation.findMany({
      select: { id: true, jobId: true, freelancerId: true },
    });

    const seenConvPairs = new Set<string>();
    const duplicateConvPairs: string[] = [];
    for (const c of convPairs) {
      if (c.jobId && c.freelancerId) {
        const key = `${c.jobId}_${c.freelancerId}`;
        if (seenConvPairs.has(key)) {
          duplicateConvPairs.push(`Pair (${key}) in conversation ${c.id}`);
        } else {
          seenConvPairs.add(key);
        }
      }
    }

    if (duplicateConvPairs.length > 0) {
      throw new Error(
        `Pre-flight check FAILED: ${duplicateConvPairs.length} duplicate (jobId, freelancerId) pairs found! Run scripts/safe-backfill-conversations.ts and resolve conflicts before index deployment.`
      );
    }
    console.log("[Index Deploy] ✅ Conversations uniqueness check passed (0 duplicates).");

    // ---------------------------------------------------------
    // Step 2: Deploy "conversations" Indexes
    // ---------------------------------------------------------
    // Deploy compound unique index on (jobId, freelancerId)
    if (!convIndexMap.has("conversations_jobId_freelancerId_unique")) {
      console.log("[Index Deploy] Creating index 'conversations_jobId_freelancerId_unique'...");
      await prisma.$runCommandRaw({
        createIndexes: "conversations",
        indexes: [
          {
            key: { jobId: 1, freelancerId: 1 },
            name: "conversations_jobId_freelancerId_unique",
            unique: true,
          },
        ],
      });
      console.log("[Index Deploy] Created 'conversations_jobId_freelancerId_unique'.");
    } else {
      console.log("[Index Deploy] Index 'conversations_jobId_freelancerId_unique' already exists.");
    }

    // Deploy partial unique index on contractId
    const existingContractIdx = convIndexMap.get("conversations_contractId_key");
    const isAlreadyPartial =
      existingContractIdx &&
      existingContractIdx.partialFilterExpression &&
      JSON.stringify(existingContractIdx.partialFilterExpression).includes("objectId");

    if (!isAlreadyPartial) {
      console.log("[Index Deploy] Upgrading 'conversations_contractId_key' to partialFilterExpression: { contractId: { $type: 'objectId' } }...");
      if (existingContractIdx) {
        await prisma.$runCommandRaw({
          dropIndexes: "conversations",
          index: "conversations_contractId_key",
        });
        console.log("[Index Deploy] Dropped legacy index 'conversations_contractId_key'.");
      }

      await prisma.$runCommandRaw({
        createIndexes: "conversations",
        indexes: [
          {
            key: { contractId: 1 },
            name: "conversations_contractId_key",
            unique: true,
            partialFilterExpression: {
              contractId: { $type: "objectId" },
            },
          },
        ],
      });
      console.log("[Index Deploy] Created partial unique index 'conversations_contractId_key'.");
    } else {
      console.log("[Index Deploy] 'conversations_contractId_key' already configured with partialFilterExpression.");
    }

    // ---------------------------------------------------------
    // Step 3: Pre-Flight Audit for "interview_invitations"
    // ---------------------------------------------------------
    console.log("[Index Deploy] Step 2: Inspecting 'interview_invitations' collection...");
    let existingInvIndexes: any[] = [];
    try {
      const res = (await prisma.$runCommandRaw({ listIndexes: "interview_invitations" })) as any;
      existingInvIndexes = res?.cursor?.firstBatch || [];
    } catch {
      console.log("[Index Deploy] 'interview_invitations' collection has no custom indexes yet.");
    }

    const invIndexMap = new Map<string, any>(existingInvIndexes.map((idx) => [idx.name, idx]));

    // Pre-flight duplicate check on interview_invitations
    const invPairs = await prisma.interviewInvitation.findMany({
      select: { id: true, jobId: true, freelancerId: true },
    });

    const seenInvPairs = new Set<string>();
    const duplicateInvPairs: string[] = [];
    for (const inv of invPairs) {
      const key = `${inv.jobId}_${inv.freelancerId}`;
      if (seenInvPairs.has(key)) {
        duplicateInvPairs.push(`Pair (${key}) in invitation ${inv.id}`);
      } else {
        seenInvPairs.add(key);
      }
    }

    if (duplicateInvPairs.length > 0) {
      throw new Error(
        `Pre-flight check FAILED: ${duplicateInvPairs.length} duplicate (jobId, freelancerId) pairs found in interview_invitations!`
      );
    }
    console.log("[Index Deploy] ✅ Invitations uniqueness check passed (0 duplicates).");

    // ---------------------------------------------------------
    // Step 4: Deploy "interview_invitations" Indexes
    // ---------------------------------------------------------
    const newInvIndexes: any[] = [];

    if (!invIndexMap.has("invitations_jobId_freelancerId_unique")) {
      newInvIndexes.push({
        key: { jobId: 1, freelancerId: 1 },
        name: "invitations_jobId_freelancerId_unique",
        unique: true,
      });
    }
    if (!invIndexMap.has("invitations_freelancerId_status_idx")) {
      newInvIndexes.push({
        key: { freelancerId: 1, status: 1 },
        name: "invitations_freelancerId_status_idx",
      });
    }
    if (!invIndexMap.has("invitations_clientId_status_idx")) {
      newInvIndexes.push({
        key: { clientId: 1, status: 1 },
        name: "invitations_clientId_status_idx",
      });
    }
    if (!invIndexMap.has("invitations_jobId_idx")) {
      newInvIndexes.push({
        key: { jobId: 1 },
        name: "invitations_jobId_idx",
      });
    }

    if (newInvIndexes.length > 0) {
      console.log(`[Index Deploy] Creating ${newInvIndexes.length} indexes on 'interview_invitations'...`);
      await prisma.$runCommandRaw({
        createIndexes: "interview_invitations",
        indexes: newInvIndexes,
      });
      console.log("[Index Deploy] Created 'interview_invitations' indexes.");
    } else {
      console.log("[Index Deploy] All 'interview_invitations' indexes already present.");
    }

    // ---------------------------------------------------------
    // Step 5: Pre-Flight Audit & Deployment for "notifications"
    // ---------------------------------------------------------
    console.log("[Index Deploy] Step 3: Inspecting 'notifications' collection...");
    let existingNotifIndexes: any[] = [];
    try {
      const res = (await prisma.$runCommandRaw({ listIndexes: "notifications" })) as any;
      existingNotifIndexes = res?.cursor?.firstBatch || [];
    } catch {
      console.log("[Index Deploy] 'notifications' collection has no custom indexes yet.");
    }

    const notifIndexMap = new Map<string, any>(existingNotifIndexes.map((idx) => [idx.name, idx]));
    const existingIdempIdx = notifIndexMap.get("notifications_idempotencyKey_unique");
    const isAlreadyPartialIdemp =
      existingIdempIdx &&
      existingIdempIdx.partialFilterExpression &&
      JSON.stringify(existingIdempIdx.partialFilterExpression).includes("string");

    if (!isAlreadyPartialIdemp) {
      console.log("[Index Deploy] Deploying partial unique index 'notifications_idempotencyKey_unique'...");
      if (existingIdempIdx) {
        await prisma.$runCommandRaw({
          dropIndexes: "notifications",
          index: "notifications_idempotencyKey_unique",
        });
      }
      await prisma.$runCommandRaw({
        createIndexes: "notifications",
        indexes: [
          {
            key: { idempotencyKey: 1 },
            name: "notifications_idempotencyKey_unique",
            unique: true,
            partialFilterExpression: {
              idempotencyKey: { $type: "string" },
            },
          },
        ],
      });
      console.log("[Index Deploy] Created partial unique index 'notifications_idempotencyKey_unique'.");
    } else {
      console.log("[Index Deploy] Index 'notifications_idempotencyKey_unique' already configured with partialFilterExpression.");
    }

    console.log("[Index Deploy] ✅ All Phase 3 indexes verified and deployed successfully.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[Index Deploy Error]:", err.message || err);
  process.exit(1);
});
