import { prisma } from "../src/lib/prisma";

async function main() {
  const updateResult = await prisma.$runCommandRaw({
    update: "users",
    updates: [
      {
        q: { roleSelected: { $exists: false } },
        u: { $set: { roleSelected: true } },
        multi: true,
      },
    ],
  });
  console.log("Raw update result:", updateResult);

  const clients = await prisma.user.findMany({
    where: { role: "CLIENT", roleSelected: true },
    select: { id: true, name: true, companyName: true },
  });
  console.log("Clients after backfill:", clients);

  const freelancers = await prisma.user.findMany({
    where: { role: "FREELANCER", roleSelected: true },
    select: { id: true, name: true },
  });
  console.log("Freelancers after backfill:", freelancers);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
