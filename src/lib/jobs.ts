import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { SEED_JOBS } from "@/data/jobs";
import { Job, JobPagination, JobFilterFacets } from "@/types";
import { PaymentType, ExperienceLevel, Prisma } from "@prisma/client";

/**
 * Validation schema for incoming GET /api/jobs query parameters.
 * Normalizes inputs, handles case conversions, and ensures safe boundaries.
 */
export const JobQuerySchema = z.object({
  search: z
    .string()
    .max(100, "Search query cannot exceed 100 characters")
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
    .transform((val) => (val ? (val.toUpperCase() as "HOURLY" | "FIXED") : undefined)),
  experienceLevel: z
    .enum(["ENTRY", "INTERMEDIATE", "EXPERT", "entry", "intermediate", "expert"])
    .optional()
    .transform((val) =>
      val ? (val.toUpperCase() as "ENTRY" | "INTERMEDIATE" | "EXPERT") : undefined
    ),
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
  minBudget: z.coerce
    .number()
    .min(0, "Minimum budget cannot be negative")
    .optional(),
  maxBudget: z.coerce
    .number()
    .min(0, "Maximum budget cannot be negative")
    .optional(),
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

export type JobQueryParams = z.infer<typeof JobQuerySchema>;

/**
 * In-memory TTL cache for distinct skills in database to power
 * case-insensitive search queries without full-table scans.
 */
let cachedSkills: { skills: string[]; expiresAt: number } | null = null;

async function getCachedKnownSkills(): Promise<string[]> {
  const now = Date.now();
  if (cachedSkills && cachedSkills.expiresAt > now) {
    return cachedSkills.skills;
  }
  try {
    const jobs = await prisma.job.findMany({
      where: { status: "OPEN" },
      select: { skills: true },
    });
    const skills = Array.from(new Set(jobs.flatMap((j) => j.skills || [])));
    cachedSkills = { skills, expiresAt: now + 60_000 };
    return skills;
  } catch {
    return [];
  }
}

interface CachedJobFilterFacets {
  facets: JobFilterFacets;
  expiresAt: number;
}

let cachedJobFilterFacets: CachedJobFilterFacets | null = null;
const FILTER_FACETS_TTL_MS = 60_000; // 60 seconds bounded staleness

/**
 * Invalidates the in-memory job filter facet cache.
 * Useful when jobs are published, closed, or during automated test runs.
 */
export function invalidateJobFilterCache(): void {
  cachedJobFilterFacets = null;
}

/**
 * Derives available filter options (categories, top skills, and budget bounds)
 * from real MongoDB Atlas data using an optimized aggregation pipeline
 * and a 60-second in-memory cache with bounded staleness.
 */
export async function getJobFilterOptions(): Promise<JobFilterFacets> {
  if (process.env.USE_MOCK_DATA === "true") {
    return getFallbackFilterOptions();
  }

  // 1. Check in-memory TTL cache
  if (cachedJobFilterFacets && Date.now() < cachedJobFilterFacets.expiresAt) {
    return cachedJobFilterFacets.facets;
  }

  try {
    // 2. Execute bounded MongoDB aggregation pipeline via $facet
    const rawResult = (await prisma.job.aggregateRaw({
      pipeline: [
        { $match: { status: "OPEN" } },
        {
          $facet: {
            categories: [
              { $match: { category: { $ne: null, $exists: true } } },
              { $group: { _id: "$category", count: { $sum: 1 } } },
              { $sort: { count: -1 } },
            ],
            skills: [
              { $match: { skills: { $exists: true, $ne: null } } },
              { $unwind: "$skills" },
              { $group: { _id: "$skills", count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 20 },
            ],
            budgetBounds: [
              {
                $project: {
                  effectiveBudget: {
                    $cond: [
                      { $eq: ["$type", "FIXED"] },
                      "$budget",
                      "$hourlyMax",
                    ],
                  },
                },
              },
              {
                $match: {
                  effectiveBudget: { $ne: null, $gt: 0 },
                },
              },
              {
                $group: {
                  _id: null,
                  min: { $min: "$effectiveBudget" },
                  max: { $max: "$effectiveBudget" },
                },
              },
            ],
          },
        },
      ],
    })) as unknown as Array<{
      categories?: Array<{ _id: string; count: number }>;
      skills?: Array<{ _id: string; count: number }>;
      budgetBounds?: Array<{ _id: null; min?: number; max?: number }>;
    }>;

    const facetData = rawResult?.[0];
    const categories = (facetData?.categories || [])
      .filter((c) => Boolean(c._id))
      .map((c) => ({ category: String(c._id), count: Number(c.count) || 0 }));

    const skills = (facetData?.skills || [])
      .filter((s) => Boolean(s._id))
      .map((s) => ({ skill: String(s._id), count: Number(s.count) || 0 }));

    const bounds = facetData?.budgetBounds?.[0];
    const rawMin = bounds?.min;
    const rawMax = bounds?.max;

    const facets: JobFilterFacets = {
      categories,
      skills,
      budgetBounds: {
        min: rawMin != null && !isNaN(rawMin) ? Math.floor(rawMin) : 0,
        max:
          rawMax != null && !isNaN(rawMax) && rawMax > 0
            ? Math.ceil(rawMax)
            : 10000,
      },
    };

    // 3. Cache derived facets for 60 seconds
    cachedJobFilterFacets = {
      facets,
      expiresAt: Date.now() + FILTER_FACETS_TTL_MS,
    };

    return facets;
  } catch (error) {
    console.error("[WorkPulse Filter Options Error]:", error);
    return {
      categories: [],
      skills: [],
      budgetBounds: { min: 0, max: 10000 },
    };
  }
}

/**
 * Retrieves a paginated and filtered list of jobs.
 * Executes live queries against MongoDB Atlas via Prisma.
 * Strictly guarantees that only OPEN discoverable jobs are exposed.
 */
export async function getJobs(rawParams: unknown): Promise<{
  data: Job[];
  pagination: JobPagination;
  facets?: JobFilterFacets;
  source: "database" | "seed";
}> {
  const validated = JobQuerySchema.parse(rawParams);

  if (process.env.USE_MOCK_DATA === "true") {
    return getFallbackJobs(validated);
  }

  try {
    const andConditions: Prisma.JobWhereInput[] = [
      { status: "OPEN" }, // Strictly discoverable jobs only
    ];

    // 1. Category Filter
    if (validated.category) {
      andConditions.push({
        category: { equals: validated.category, mode: "insensitive" },
      });
    }

    // 2. Payment Type Filter
    if (validated.type) {
      andConditions.push({
        type: validated.type as PaymentType,
      });
    }

    // 3. Experience Level Filter
    if (validated.experienceLevel) {
      andConditions.push({
        experienceLevel: validated.experienceLevel as ExperienceLevel,
      });
    }

    // 4. Skills Filter
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

    // 5. Budget or Hourly Rate Range Filter
    if (validated.minBudget != null || validated.maxBudget != null) {
      const min = validated.minBudget;
      const max = validated.maxBudget;

      if (validated.type === "FIXED") {
        const budgetFilter: Prisma.FloatNullableFilter = {};
        if (min != null) budgetFilter.gte = min;
        if (max != null) budgetFilter.lte = max;
        andConditions.push({ budget: budgetFilter });
      } else if (validated.type === "HOURLY") {
        const hourlyConditions: Prisma.JobWhereInput = { type: "HOURLY" };
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
        // Unspecified type: match either FIXED jobs in range OR HOURLY jobs in range
        const fixedFilter: Prisma.FloatNullableFilter = {};
        if (min != null) fixedFilter.gte = min;
        if (max != null) fixedFilter.lte = max;

        const hourlyConditions: Prisma.JobWhereInput = { type: "HOURLY" };
        if (min != null && max != null) {
          hourlyConditions.hourlyMax = { gte: min };
          hourlyConditions.hourlyMin = { lte: max };
        } else if (min != null) {
          hourlyConditions.hourlyMax = { gte: min };
        } else if (max != null) {
          hourlyConditions.hourlyMin = { lte: max };
        }

        andConditions.push({
          OR: [
            { type: "FIXED", budget: fixedFilter },
            hourlyConditions,
          ],
        });
      }
    }

    // 6. Keyword Search across title, description, category, and skills
    if (validated.search) {
      const q = validated.search;
      const knownSkills = await getCachedKnownSkills();
      const matchingSkills = knownSkills.filter((s) =>
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

    const where: Prisma.JobWhereInput =
      andConditions.length === 1 ? andConditions[0] : { AND: andConditions };

    // 7. Deterministic Sorting with Tie-Breaker
    let orderBy: Prisma.JobOrderByWithRelationInput[];

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
      // default: newest
      orderBy = [{ createdAt: "desc" }, { id: "desc" }];
    }

    const skip = (validated.page - 1) * validated.limit;
    const take = validated.limit;

    const [total, jobs, facets] = await Promise.all([
      prisma.job.count({ where }),
      prisma.job.findMany({
        where,
        orderBy,
        skip,
        take,
      }),
      validated.includeFacets ? getJobFilterOptions() : Promise.resolve(undefined),
    ]);

    return {
      data: jobs as unknown as Job[],
      pagination: {
        total,
        page: validated.page,
        limit: validated.limit,
        totalPages: Math.ceil(total / validated.limit) || 1,
      },
      facets,
      source: "database",
    };
  } catch (error) {
    console.error(
      "[WorkPulse Data Layer] Database query failed:",
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

/**
 * Checks whether an incoming string is a valid 24-character hexadecimal MongoDB ObjectId.
 */
export function isValidObjectId(id: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

/**
 * Retrieves a single job by unique identifier from MongoDB Atlas.
 * Validates MongoDB ObjectId format before database query to prevent BSON errors.
 */
export async function getJobById(id: string): Promise<{
  data: Job | null;
  source: "database" | "seed";
}> {
  if (process.env.USE_MOCK_DATA === "true") {
    const fallback = SEED_JOBS.find(
      (j) => j.id === id || (j as { legacyId?: string }).legacyId === id
    );
    return {
      data: fallback ? (fallback as unknown as Job) : null,
      source: "seed",
    };
  }

  if (!isValidObjectId(id)) {
    return { data: null, source: "database" };
  }

  try {
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            companyName: true,
            companyDescription: true,
            companyWebsite: true,
            companyIndustry: true,
            location: true,
          },
        },
      },
    });

    return {
      data: job ? (job as unknown as Job) : null,
      source: "database",
    };
  } catch (error) {
    console.error(
      `[WorkPulse Data Layer] Database query failed for job ID: ${id}:`,
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

/**
 * Development fallback filter options for SEED_JOBS.
 */
function getFallbackFilterOptions(): JobFilterFacets {
  const categoryMap = new Map<string, number>();
  const skillMap = new Map<string, number>();
  let minBudget = Infinity;
  let maxBudget = 0;

  for (const job of SEED_JOBS) {
    if (job.category) {
      categoryMap.set(job.category, (categoryMap.get(job.category) || 0) + 1);
    }
    if (Array.isArray(job.skills)) {
      for (const skill of job.skills) {
        skillMap.set(skill, (skillMap.get(skill) || 0) + 1);
      }
    }
    const b = job.budget ?? job.hourlyMax;
    if (b != null && !isNaN(b)) {
      if (b < minBudget) minBudget = b;
      if (b > maxBudget) maxBudget = b;
    }
  }

  return {
    categories: Array.from(categoryMap.entries()).map(([category, count]) => ({
      category,
      count,
    })),
    skills: Array.from(skillMap.entries())
      .map(([skill, count]) => ({ skill, count }))
      .slice(0, 20),
    budgetBounds: {
      min: minBudget === Infinity ? 0 : minBudget,
      max: maxBudget === 0 ? 10000 : maxBudget,
    },
  };
}

/**
 * Development fallback implementation for in-memory seed query evaluation.
 */
function getFallbackJobs(params: JobQueryParams): {
  data: Job[];
  pagination: JobPagination;
  facets?: JobFilterFacets;
  source: "database" | "seed";
} {
  let list = [...SEED_JOBS];

  // 1. Category Filter
  if (params.category && params.category !== "all") {
    list = list.filter(
      (j) => j.category.toLowerCase() === params.category?.toLowerCase()
    );
  }

  // 2. Payment Type Filter
  if (params.type) {
    const typeUpper = params.type.toUpperCase();
    list = list.filter((j) => j.type === typeUpper);
  }

  // 3. Experience Level Filter
  if (params.experienceLevel) {
    const expUpper = params.experienceLevel.toUpperCase();
    list = list.filter((j) => j.experienceLevel === expUpper);
  }

  // 4. Skills Filter
  const requestedSkills = [
    ...(params.skill ? [params.skill] : []),
    ...(params.skills ? params.skills.split(",").map((s) => s.trim()) : []),
  ].filter(Boolean);

  if (requestedSkills.length > 0) {
    list = list.filter((j) =>
      requestedSkills.some((reqSkill) =>
        j.skills.some((s) => s.toLowerCase() === reqSkill.toLowerCase())
      )
    );
  }

  // 5. Budget Range Filter
  if (params.minBudget != null || params.maxBudget != null) {
    const min = params.minBudget ?? 0;
    const max = params.maxBudget ?? Infinity;
    list = list.filter((j) => {
      const b = j.budget ?? j.hourlyMax ?? j.hourlyMin ?? 0;
      return b >= min && b <= max;
    });
  }

  // 6. Keyword Search
  if (params.search && params.search.trim()) {
    const q = params.search.trim().toLowerCase();
    list = list.filter((j) => {
      const matchTitle = j.title.toLowerCase().includes(q);
      const matchDesc = j.description.toLowerCase().includes(q);
      const matchCat = j.category.toLowerCase().includes(q);
      const matchSkills = j.skills.some((s) => s.toLowerCase().includes(q));
      return matchTitle || matchDesc || matchCat || matchSkills;
    });
  }

  // 7. Sorting
  if (params.sortBy === "oldest") {
    list = list.reverse();
  } else if (params.sortBy === "budget_desc") {
    list = list.sort((a, b) => {
      const valA = a.budget ?? a.hourlyMax ?? 0;
      const valB = b.budget ?? b.hourlyMax ?? 0;
      return valB - valA;
    });
  } else if (params.sortBy === "budget_asc") {
    list = list.sort((a, b) => {
      const valA = a.budget ?? a.hourlyMin ?? 0;
      const valB = b.budget ?? b.hourlyMin ?? 0;
      return valA - valB;
    });
  } else if (params.sortBy === "proposals_desc") {
    list = list.sort((a, b) => (b.proposalsCount ?? 0) - (a.proposalsCount ?? 0));
  } else if (params.sortBy === "proposals_asc") {
    list = list.sort((a, b) => (a.proposalsCount ?? 0) - (b.proposalsCount ?? 0));
  }

  const total = list.length;
  const skip = (params.page - 1) * params.limit;
  const paginated = list.slice(skip, skip + params.limit);

  return {
    data: paginated as unknown as Job[],
    pagination: {
      total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(total / params.limit) || 1,
    },
    facets: params.includeFacets ? getFallbackFilterOptions() : undefined,
    source: "seed",
  };
}
