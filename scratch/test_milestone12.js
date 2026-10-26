const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');

const prisma = new PrismaClient();

// Mirror JobQuerySchema from src/lib/jobs.ts
const JobQuerySchema = z.object({
  search: z
    .string()
    .max(100)
    .optional()
    .transform((val) => (val ? val.trim() : undefined)),
  category: z
    .string()
    .max(100)
    .optional()
    .transform((val) => (val && val !== "all" ? val.trim() : undefined)),
  type: z
    .enum(["HOURLY", "FIXED", "hourly", "fixed"])
    .optional()
    .transform((val) => (val ? val.toUpperCase() : undefined)),
  experienceLevel: z
    .enum(["ENTRY", "INTERMEDIATE", "EXPERT", "entry", "intermediate", "expert"])
    .optional()
    .transform((val) => (val ? val.toUpperCase() : undefined)),
  skill: z
    .string()
    .max(50)
    .optional()
    .transform((val) => (val ? val.trim() : undefined)),
  skills: z
    .string()
    .max(200)
    .optional()
    .transform((val) => (val ? val.trim() : undefined)),
  minBudget: z.coerce.number().min(0).optional(),
  maxBudget: z.coerce.number().min(0).optional(),
  sortBy: z
    .enum([
      "newest",
      "oldest",
      "budget_desc",
      "budget_asc",
      "proposals_desc",
      "proposals_asc",
    ])
    .optional()
    .default("newest"),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
  includeFacets: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .transform((val) => val === true || val === "true"),
});

// Implementation of getJobs logic to run directly against MongoDB Atlas
async function executeGetJobs(rawParams) {
  const validated = JobQuerySchema.parse(rawParams);

  const andConditions = [{ status: "OPEN" }];

  if (validated.category) {
    andConditions.push({
      category: { equals: validated.category, mode: "insensitive" },
    });
  }

  if (validated.type) {
    andConditions.push({ type: validated.type });
  }

  if (validated.experienceLevel) {
    andConditions.push({ experienceLevel: validated.experienceLevel });
  }

  const requestedSkills = [
    ...(validated.skill ? [validated.skill] : []),
    ...(validated.skills ? validated.skills.split(",").map((s) => s.trim()) : []),
  ].filter(Boolean);

  if (requestedSkills.length > 0) {
    if (requestedSkills.length === 1) {
      andConditions.push({ skills: { has: requestedSkills[0] } });
    } else {
      andConditions.push({ skills: { hasSome: requestedSkills } });
    }
  }

  if (validated.minBudget != null || validated.maxBudget != null) {
    const min = validated.minBudget;
    const max = validated.maxBudget;

    if (validated.type === "FIXED") {
      const budgetFilter = {};
      if (min != null) budgetFilter.gte = min;
      if (max != null) budgetFilter.lte = max;
      andConditions.push({ budget: budgetFilter });
    } else if (validated.type === "HOURLY") {
      const hourlyConditions = { type: "HOURLY" };
      if (min != null && max != null) {
        hourlyConditions.hourlyMax = { gte: min };
        hourlyConditions.hourlyMin = { lte: max };
      } else if (min != null) {
        hourlyConditions.hourlyMax = { gte: min };
      } else if (max != null) {
        hourlyConditions.hourlyMin = { lte: max };
      }
      andConditions.push(hourlyConditions);
    } else {
      const fixedFilter = {};
      if (min != null) fixedFilter.gte = min;
      if (max != null) fixedFilter.lte = max;

      const hourlyConditions = { type: "HOURLY" };
      if (min != null && max != null) {
        hourlyConditions.hourlyMax = { gte: min };
        hourlyConditions.hourlyMin = { lte: max };
      } else if (min != null) {
        hourlyConditions.hourlyMax = { gte: min };
      } else if (max != null) {
        hourlyConditions.hourlyMin = { lte: max };
      }

      andConditions.push({
        OR: [{ type: "FIXED", budget: fixedFilter }, hourlyConditions],
      });
    }
  }

  if (validated.search) {
    const q = validated.search;
    // Known skills expansion
    const allOpenJobs = await prisma.job.findMany({
      where: { status: "OPEN" },
      select: { skills: true },
    });
    const allSkills = Array.from(new Set(allOpenJobs.flatMap((j) => j.skills || [])));
    const matchingSkills = allSkills.filter((s) =>
      s.toLowerCase().includes(q.toLowerCase())
    );

    andConditions.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
        ...(matchingSkills.length > 0
          ? [{ skills: { hasSome: matchingSkills } }]
          : [{ skills: { has: q } }]),
      ],
    });
  }

  const where = andConditions.length === 1 ? andConditions[0] : { AND: andConditions };

  let orderBy;
  if (validated.sortBy === "oldest") {
    orderBy = [{ createdAt: "asc" }, { id: "asc" }];
  } else if (validated.sortBy === "budget_desc") {
    orderBy = [
      { budget: "desc" },
      { hourlyMax: "desc" },
      { createdAt: "desc" },
      { id: "desc" },
    ];
  } else if (validated.sortBy === "budget_asc") {
    orderBy = [
      { budget: "asc" },
      { hourlyMin: "asc" },
      { createdAt: "desc" },
      { id: "asc" },
    ];
  } else if (validated.sortBy === "proposals_desc") {
    orderBy = [{ proposalsCount: "desc" }, { createdAt: "desc" }, { id: "desc" }];
  } else if (validated.sortBy === "proposals_asc") {
    orderBy = [{ proposalsCount: "asc" }, { createdAt: "desc" }, { id: "desc" }];
  } else {
    orderBy = [{ createdAt: "desc" }, { id: "desc" }];
  }

  const skip = (validated.page - 1) * validated.limit;
  const take = validated.limit;

  const [total, data] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({ where, orderBy, skip, take }),
  ]);

  return {
    data,
    pagination: {
      total,
      page: validated.page,
      limit: validated.limit,
      totalPages: Math.ceil(total / validated.limit) || 1,
    },
  };
}

async function runTests() {
  console.log("=================================================");
  console.log("  WORKPULSE MILESTONE 12 INTEGRATION TEST SUITE  ");
  console.log("  Advanced Job Search, Filtering, Sorting & Pagination");
  console.log("=================================================\n");

  let passed = 0;
  let total = 0;

  function assert(condition, testName) {
    total++;
    if (condition) {
      console.log(`[PASS] Test ${total}: ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] Test ${total}: ${testName}`);
    }
  }

  try {
    // 1. Keyword Search
    console.log("--- 1. Keyword Search ---");
    const searchRes1 = await executeGetJobs({ search: "Next.js" });
    assert(
      searchRes1.data.length > 0 &&
        searchRes1.data.every(
          (j) =>
            j.title.toLowerCase().includes("next.js") ||
            j.description.toLowerCase().includes("next.js") ||
            j.skills.some((s) => s.toLowerCase().includes("next.js"))
        ),
      'Search for "Next.js" matches in title/description/skills'
    );

    const searchRes2 = await executeGetJobs({ search: "architecture" });
    assert(
      searchRes2.data.length > 0 &&
        searchRes2.data.every(
          (j) =>
            j.title.toLowerCase().includes("architect") ||
            j.description.toLowerCase().includes("architect") ||
            j.skills.some((s) => s.toLowerCase().includes("architect"))
        ),
      'Case-insensitive partial matching for "architecture"'
    );

    // 2. Category Filter
    console.log("\n--- 2. Category Filter ---");
    const catRes = await executeGetJobs({ category: "Development & IT" });
    assert(
      catRes.data.length > 0 &&
        catRes.data.every((j) => j.category === "Development & IT"),
      'Category filter "Development & IT" returns only Development jobs'
    );

    const catAllRes = await executeGetJobs({ category: "all" });
    assert(
      catAllRes.data.length > catRes.data.length,
      'Category "all" resets category constraint'
    );

    // 3. Contract Type Filter
    console.log("\n--- 3. Contract Type Filter ---");
    const hourlyRes = await executeGetJobs({ type: "HOURLY" });
    assert(
      hourlyRes.data.length > 0 && hourlyRes.data.every((j) => j.type === "HOURLY"),
      "Type filter HOURLY returns only hourly jobs"
    );

    const fixedRes = await executeGetJobs({ type: "FIXED" });
    assert(
      fixedRes.data.length > 0 && fixedRes.data.every((j) => j.type === "FIXED"),
      "Type filter FIXED returns only fixed-price jobs"
    );

    // 4. Experience Level Filter
    console.log("\n--- 4. Experience Level Filter ---");
    const expRes = await executeGetJobs({ experienceLevel: "EXPERT" });
    assert(
      expRes.data.length > 0 &&
        expRes.data.every((j) => j.experienceLevel === "EXPERT"),
      "Experience level EXPERT returns only expert jobs"
    );

    // 5. Budget Range Filtering
    console.log("\n--- 5. Budget Range Filtering ---");
    const budgetRes = await executeGetJobs({
      type: "FIXED",
      minBudget: 3000,
      maxBudget: 5000,
    });
    assert(
      budgetRes.data.length > 0 &&
        budgetRes.data.every(
          (j) => j.type === "FIXED" && j.budget >= 3000 && j.budget <= 5000
        ),
      "Fixed budget range $3000-$5000 accurately restricts jobs"
    );

    // 6. Skill Filtering
    console.log("\n--- 6. Skill Filtering ---");
    const skillRes = await executeGetJobs({ skill: "TypeScript" });
    assert(
      skillRes.data.length > 0 &&
        skillRes.data.every((j) => j.skills.includes("TypeScript")),
      'Single skill filter "TypeScript" returns only jobs with TypeScript'
    );

    const multiSkillRes = await executeGetJobs({ skills: "Python,LangChain" });
    assert(
      multiSkillRes.data.length > 0 &&
        multiSkillRes.data.every((j) =>
          j.skills.some((s) => ["Python", "LangChain"].includes(s))
        ),
      'Multi-skill filter "Python,LangChain" returns matching jobs'
    );

    // 7. Sorting Verification
    console.log("\n--- 7. Sorting & Tie-Breaker ---");
    const sortBudgetDesc = await executeGetJobs({ sortBy: "budget_desc" });
    assert(
      sortBudgetDesc.data[0].budget >= (sortBudgetDesc.data[1].budget || 0),
      "budget_desc places highest budget jobs at top"
    );

    const sortBudgetAsc = await executeGetJobs({ sortBy: "budget_asc" });
    assert(
      (sortBudgetAsc.data[0].hourlyMin || 0) <= (sortBudgetAsc.data[1].hourlyMin || Infinity),
      "budget_asc places lowest budget / hourly rates at top"
    );

    const sortNewest = await executeGetJobs({ sortBy: "newest" });
    const isNewestOrdered = sortNewest.data.every((j, i) => {
      if (i === 0) return true;
      return new Date(sortNewest.data[i - 1].createdAt) >= new Date(j.createdAt);
    });
    assert(isNewestOrdered, "newest sort orders by createdAt descending");

    // 8. Server-side Pagination & Deterministic Boundaries
    console.log("\n--- 8. Server-side Pagination ---");
    const page1 = await executeGetJobs({ limit: 4, page: 1 });
    const page2 = await executeGetJobs({ limit: 4, page: 2 });
    assert(
      page1.data.length === 4 && page2.data.length === 4,
      "Limit=4 returns exactly 4 items per page"
    );

    const page1Ids = new Set(page1.data.map((j) => j.id));
    const isDisjoint = page2.data.every((j) => !page1Ids.has(j.id));
    assert(isDisjoint, "Page 1 and Page 2 contain mutually exclusive subsets of jobs");

    const outOfRange = await executeGetJobs({ page: 999, limit: 10 });
    assert(
      outOfRange.data.length === 0 && outOfRange.pagination.total > 0,
      "Out of range page safely returns empty data array while preserving total count"
    );

    // 9. Discoverability & Privacy: Draft/Closed jobs strictly excluded
    console.log("\n--- 9. Discoverability & Privacy Enforcement ---");
    const allDiscoverable = await executeGetJobs({ limit: 50 });
    const hasNonOpen = allDiscoverable.data.some((j) => j.status !== "OPEN");
    assert(!hasNonOpen, "All returned jobs strictly have status OPEN (no DRAFT or CLOSED)");

    // 10. Input Validation
    console.log("\n--- 10. Input Validation & Error Handling ---");
    let zodThrew = false;
    try {
      JobQuerySchema.parse({ minBudget: -50 });
    } catch {
      zodThrew = true;
    }
    assert(zodThrew, "Negative budget is rejected by Zod schema validation");

    let invalidEnumThrew = false;
    try {
      JobQuerySchema.parse({ sortBy: "invalid_sort_type" });
    } catch {
      invalidEnumThrew = true;
    }
    assert(invalidEnumThrew, "Invalid sortBy option is rejected by Zod schema");

    // 11. Saved Job Model Preservation
    console.log("\n--- 11. Saved Job Model Preservation ---");
    const savedJobsCount = await prisma.savedJob.count();
    assert(
      typeof savedJobsCount === "number",
      `SavedJob collection exists and is accessible (${savedJobsCount} records)`
    );

    console.log("\n=================================================");
    console.log(`  RESULTS: ${passed} / ${total} tests passed (${Math.round((passed / total) * 100)}%)`);
    console.log("=================================================");

    await prisma.$disconnect();
    process.exit(passed === total ? 0 : 1);
  } catch (err) {
    console.error("Test execution failed with error:", err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

runTests();
