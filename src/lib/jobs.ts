import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { SEED_JOBS } from "@/data/jobs";
import { Job, JobPagination } from "@/types";
import { PaymentType, ExperienceLevel, Prisma } from "@prisma/client";

/**
 * Validation schema for incoming GET /api/jobs query parameters.
 */
export const JobQuerySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  type: z.enum(["HOURLY", "FIXED", "hourly", "fixed"]).optional(),
  experienceLevel: z
    .enum(["ENTRY", "INTERMEDIATE", "EXPERT", "entry", "intermediate", "expert"])
    .optional(),
  sortBy: z
    .enum(["newest", "oldest", "budget_desc", "budget_asc"])
    .optional()
    .default("newest"),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

export type JobQueryParams = z.infer<typeof JobQuerySchema>;

/**
 * Retrieves a paginated and filtered list of jobs.
 * Executes live queries against MongoDB Atlas via Prisma.
 * If USE_MOCK_DATA="true" is explicitly set in development, falls back to SEED_JOBS.
 */
export async function getJobs(rawParams: unknown): Promise<{
  data: Job[];
  pagination: JobPagination;
  source: "database" | "seed";
}> {
  const validated = JobQuerySchema.parse(rawParams);

  if (process.env.USE_MOCK_DATA === "true") {
    return getFallbackJobs(validated);
  }

  try {
    const where: Prisma.JobWhereInput = {
      status: "OPEN",
    };

    if (validated.category && validated.category !== "all") {
      where.category = { equals: validated.category, mode: "insensitive" };
    }

    if (validated.type) {
      where.type = validated.type.toUpperCase() as PaymentType;
    }

    if (validated.experienceLevel) {
      where.experienceLevel = validated.experienceLevel.toUpperCase() as ExperienceLevel;
    }

    if (validated.search && validated.search.trim()) {
      const q = validated.search.trim();
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
        { skills: { has: q } },
      ];
    }

    let orderBy:
      | Prisma.JobOrderByWithRelationInput
      | Prisma.JobOrderByWithRelationInput[] = { createdAt: "desc" };

    if (validated.sortBy === "oldest") {
      orderBy = { createdAt: "asc" };
    } else if (validated.sortBy === "budget_desc") {
      orderBy = [{ budget: "desc" }, { hourlyMax: "desc" }];
    } else if (validated.sortBy === "budget_asc") {
      orderBy = [{ budget: "asc" }, { hourlyMin: "asc" }];
    }

    const skip = (validated.page - 1) * validated.limit;
    const take = validated.limit;

    const [total, jobs] = await Promise.all([
      prisma.job.count({ where }),
      prisma.job.findMany({
        where,
        orderBy,
        skip,
        take,
      }),
    ]);

    return {
      data: jobs as unknown as Job[],
      pagination: {
        total,
        page: validated.page,
        limit: validated.limit,
        totalPages: Math.ceil(total / validated.limit) || 1,
      },
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
 * Development fallback implementation for in-memory seed query evaluation.
 */
function getFallbackJobs(params: JobQueryParams): {
  data: Job[];
  pagination: JobPagination;
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

  // 4. Keyword Search across title, description, category, and skills
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

  // 5. Sorting
  if (params.sortBy === "oldest") {
    // stable order
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
    source: "seed",
  };
}
