import { seedDevelopmentData } from "../scripts/seed-dev";
import { prisma } from "../src/lib/prisma";

export async function main() {
  await seedDevelopmentData();
}

main()
  .catch((e) => {
    console.error("Error during database seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
