import { searchClientsAction } from "../src/lib/actions/client-discovery";
import { prisma } from "../src/lib/prisma";

async function main() {
  const result = await searchClientsAction();
  console.log("searchClientsAction() result:", JSON.stringify(result, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

