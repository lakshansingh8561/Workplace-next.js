import { PrismaClient } from "@prisma/client";
import { SEED_JOBS } from "../src/data/jobs";

const prisma = new PrismaClient();

export async function main() {
  console.log("Starting WorkPulse database seed...");

  for (const job of SEED_JOBS) {
    // Exclude id from update payload and legacyId so only valid mutable fields are passed
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, legacyId, ...dataWithoutId } = job as typeof job & { legacyId?: string };

    await prisma.job.upsert({
      where: { id },
      update: {
        ...dataWithoutId,
      },
      create: {
        id,
        ...dataWithoutId,
      },
    });
  }

  const count = await prisma.job.count();
  console.log(`✓ Seed completed successfully. Total jobs in database: ${count}`);
}

main()
  .catch((e) => {
    console.error("Error during database seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
