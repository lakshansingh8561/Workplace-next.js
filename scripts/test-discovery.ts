import { searchClientsAction } from "../src/lib/actions/client-discovery";
import { searchFreelancersAction } from "../src/lib/actions/freelancer-discovery";
import { prisma } from "../src/lib/prisma";

async function main() {
  const clientsRes = await searchClientsAction({ limit: 12 });
  console.log("Clients Search Result:");
  console.log(`Success: ${clientsRes.success}, Total: ${clientsRes.totalCount}, Returned: ${clientsRes.clients.length}`);
  console.log("Sample clients:", clientsRes.clients.slice(0, 3).map(c => ({
    name: c.name,
    company: c.companyName,
    industry: c.companyIndustry,
    openJobs: c.openJobsCount,
    image: c.image,
  })));

  const freelancersRes = await searchFreelancersAction({ limit: 12 });
  console.log("\nFreelancers Search Result:");
  console.log(`Success: ${freelancersRes.success}, Total: ${freelancersRes.totalCount}, Returned: ${freelancersRes.freelancers.length}`);
  console.log("Sample freelancers:", freelancersRes.freelancers.slice(0, 3).map(f => ({
    name: f.name,
    title: f.title,
    hourlyRate: f.hourlyRate,
    skills: f.skills.slice(0, 4),
    image: f.image,
  })));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

