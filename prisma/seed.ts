import { PrismaClient } from "@prisma/client";
import { SEED_JOBS } from "../src/data/jobs";

const prisma = new PrismaClient();

export async function main() {
  console.log("Starting WorkPulse database seed...");

  for (const job of SEED_JOBS) {
    // Exclude in-memory legacyId property so only valid schema fields are passed to MongoDB
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { legacyId, ...jobData } = job as typeof job & { legacyId?: string };

    await prisma.job.upsert({
      where: { id: jobData.id },
      update: {
        ...jobData,
      },
      create: {
        ...jobData,
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
