"use server";

import { prisma } from "@/lib/prisma";
import { getDeterministicAvatar } from "@/lib/avatar-map";

export interface PublicClientCardData {
  id: string;
  name: string;
  companyName: string | null;
  companyDescription: string | null;
  companyIndustry: string | null;
  companyWebsite: string | null;
  location: string | null;
  image: string;
  openJobsCount: number;
  totalJobsCount: number;
  createdAt: string;
}

export interface SearchClientsOptions {
  query?: string;
  industry?: string;
  location?: string;
  sort?: "jobs_desc" | "recent" | "name_asc";
  page?: number;
  limit?: number;
}

export interface SearchClientsResult {
  success: boolean;
  clients: PublicClientCardData[];
  totalCount: number;
  page: number;
  totalPages: number;
  industries: string[];
  error?: string;
}

/**
 * Searches and paginates public client / company profiles for freelancer discovery.
 * Strictly enforces public privacy: excludes email, auth credentials, and unpublished jobs.
 */
export async function searchClientsAction(
  options?: SearchClientsOptions
): Promise<SearchClientsResult> {
  try {
    const page = Math.max(1, Number(options?.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(options?.limit) || 12));
    const skip = (page - 1) * limit;

    const query = options?.query?.trim();
    const industry = options?.industry?.trim();
    const location = options?.location?.trim();
    const sort = options?.sort || "jobs_desc";

    // Build Prisma filter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      role: "CLIENT",
      roleSelected: true,
    };

    if (query) {
      where.OR = [
        { companyName: { contains: query, mode: "insensitive" } },
        { name: { contains: query, mode: "insensitive" } },
        { companyDescription: { contains: query, mode: "insensitive" } },
        { companyIndustry: { contains: query, mode: "insensitive" } },
      ];
    }

    if (industry && industry !== "ALL") {
      where.companyIndustry = { equals: industry, mode: "insensitive" };
    }

    if (location && location !== "ALL") {
      where.location = { contains: location, mode: "insensitive" };
    }

    // Determine sorting
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let orderBy: any = [{ createdAt: "desc" }];
    if (sort === "name_asc") {
      orderBy = [{ companyName: "asc" }, { name: "asc" }];
    } else if (sort === "recent") {
      orderBy = [{ createdAt: "desc" }];
    }

    // Execute query and total count
    const [rawClients, totalCount, allIndustries] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          image: true,
          companyName: true,
          companyDescription: true,
          companyIndustry: true,
          companyWebsite: true,
          location: true,
          createdAt: true,
          _count: {
            select: {
              jobs: true,
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
      prisma.user.findMany({
        where: {
          role: "CLIENT",
          companyIndustry: { not: null },
        },
        select: { companyIndustry: true },
        distinct: ["companyIndustry"],
      }),
    ]);

    // Aggregate open jobs count for each client in current page
    const clientIds = rawClients.map((c) => c.id);
    let openJobsMap = new Map<string, number>();

    if (clientIds.length > 0) {
      const openJobCounts = await prisma.job.groupBy({
        by: ["clientId"],
        where: {
          clientId: { in: clientIds },
          status: "OPEN",
        },
        _count: {
          _all: true,
        },
      });

      openJobsMap = new Map(
        openJobCounts
          .filter((g) => g.clientId !== null)
          .map((g) => [g.clientId as string, g._count._all])
      );
    }

    const clients: PublicClientCardData[] = rawClients.map((c) => {
      const openJobsCount = openJobsMap.get(c.id) || 0;
      const avatarUrl = getDeterministicAvatar(
        {
          id: c.id,
          name: c.companyName || c.name,
          role: "CLIENT",
          image: c.image,
        },
        "CLIENT"
      );

      return {
        id: c.id,
        name: c.name || "Hiring Client",
        companyName: c.companyName || null,
        companyDescription: c.companyDescription || null,
        companyIndustry: c.companyIndustry || null,
        companyWebsite: c.companyWebsite || null,
        location: c.location || null,
        image: avatarUrl,
        openJobsCount,
        totalJobsCount: c._count.jobs,
        createdAt: c.createdAt.toISOString(),
      };
    });

    // If sorting by open jobs count, sort in memory
    if (sort === "jobs_desc") {
      clients.sort((a, b) => b.openJobsCount - a.openJobsCount);
    }

    const industries = Array.from(
      new Set(
        allIndustries
          .map((i) => i.companyIndustry)
          .filter((ind): ind is string => typeof ind === "string" && ind.trim().length > 0)
      )
    );

    return {
      success: true,
      clients,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit) || 1,
      industries,
    };
  } catch (error) {
    console.error("[WorkPulse Search Clients Error]:", error);
    return {
      success: false,
      clients: [],
      totalCount: 0,
      page: 1,
      totalPages: 1,
      industries: [],
      error: "Failed to load clients catalogue.",
    };
  }
}

