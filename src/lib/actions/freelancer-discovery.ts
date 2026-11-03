"use server";

import { prisma } from "@/lib/prisma";
import { getDeterministicAvatar } from "@/lib/avatar-map";

export interface PublicFreelancerCardData {
  id: string;
  name: string;
  title: string | null;
  bio: string | null;
  skills: string[];
  hourlyRate: number | null;
  experience: string | null;
  location: string | null;
  image: string;
  portfolioUrls: string[];
  completedContractsCount: number;
  averageRating: number | null;
  totalReviews: number;
  createdAt: string;
}

export interface SearchFreelancersOptions {
  query?: string;
  skill?: string;
  minRate?: number;
  maxRate?: number;
  experience?: string;
  sort?: "rating" | "rate_asc" | "rate_desc" | "recent";
  page?: number;
  limit?: number;
}

export interface SearchFreelancersResult {
  success: boolean;
  freelancers: PublicFreelancerCardData[];
  totalCount: number;
  page: number;
  totalPages: number;
  topSkills: string[];
  error?: string;
}

/**
 * Searches and paginates public freelancer profiles for client discovery.
 * Strictly enforces public privacy: excludes email, credentials, and private financial records.
 */
export async function searchFreelancersAction(
  options?: SearchFreelancersOptions
): Promise<SearchFreelancersResult> {
  try {
    const page = Math.max(1, Number(options?.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(options?.limit) || 12));
    const skip = (page - 1) * limit;

    const query = options?.query?.trim();
    const skill = options?.skill?.trim();
    const minRate = options?.minRate !== undefined ? Number(options.minRate) : undefined;
    const maxRate = options?.maxRate !== undefined ? Number(options.maxRate) : undefined;
    const experience = options?.experience?.trim();
    const sort = options?.sort || "rating";

    // Build Prisma filter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      role: "FREELANCER",
      roleSelected: true,
    };

    if (query) {
      where.OR = [
        { name: { contains: query, mode: "insensitive" } },
        { title: { contains: query, mode: "insensitive" } },
        { bio: { contains: query, mode: "insensitive" } },
        { skills: { has: query } },
      ];
    }

    if (skill && skill !== "ALL") {
      where.skills = { has: skill };
    }

    if (experience && experience !== "ALL") {
      where.experience = { contains: experience, mode: "insensitive" };
    }

    if (minRate !== undefined || maxRate !== undefined) {
      where.hourlyRate = {};
      if (minRate !== undefined && !isNaN(minRate)) {
        where.hourlyRate.gte = minRate;
      }
      if (maxRate !== undefined && !isNaN(maxRate)) {
        where.hourlyRate.lte = maxRate;
      }
    }

    // Determine sorting
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let orderBy: any = [{ createdAt: "desc" }];
    if (sort === "rate_asc") {
      orderBy = [{ hourlyRate: "asc" }, { createdAt: "desc" }];
    } else if (sort === "rate_desc") {
      orderBy = [{ hourlyRate: "desc" }, { createdAt: "desc" }];
    } else if (sort === "recent") {
      orderBy = [{ createdAt: "desc" }];
    }

    const [rawFreelancers, totalCount, allUsersSkills] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          image: true,
          title: true,
          bio: true,
          skills: true,
          hourlyRate: true,
          experience: true,
          location: true,
          portfolioUrls: true,
          createdAt: true,
          _count: {
            select: {
              freelancerContracts: true,
              reviewsReceived: true,
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
      prisma.user.findMany({
        where: { role: "FREELANCER" },
        select: { skills: true },
        take: 100,
      }),
    ]);

    // Extract top skills for quick filtering
    const skillCountMap = new Map<string, number>();
    allUsersSkills.forEach((u) => {
      u.skills?.forEach((s) => {
        const clean = s.trim();
        if (clean) {
          skillCountMap.set(clean, (skillCountMap.get(clean) || 0) + 1);
        }
      });
    });

    const topSkills = Array.from(skillCountMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([s]) => s);

    // Fetch review ratings & completed contracts
    const freelancerIds = rawFreelancers.map((f) => f.id);
    let ratingMap = new Map<string, { avg: number; count: number }>();

    if (freelancerIds.length > 0) {
      const reviewStats = await prisma.review.groupBy({
        by: ["revieweeId"],
        where: {
          revieweeId: { in: freelancerIds },
        },
        _avg: { rating: true },
        _count: { _all: true },
      });

      ratingMap = new Map(
        reviewStats.map((r) => [
          r.revieweeId,
          {
            avg: r._avg.rating ? Math.round(r._avg.rating * 10) / 10 : 5.0,
            count: r._count._all,
          },
        ])
      );
    }

    const freelancers: PublicFreelancerCardData[] = rawFreelancers.map((f) => {
      const stats = ratingMap.get(f.id) || { avg: 5.0, count: f._count.reviewsReceived };
      const avatarUrl = getDeterministicAvatar(
        {
          id: f.id,
          name: f.name,
          role: "FREELANCER",
          image: f.image,
        },
        "FREELANCER"
      );

      return {
        id: f.id,
        name: f.name || "WorkPulse Freelancer",
        title: f.title || "Independent Professional",
        bio: f.bio || null,
        skills: f.skills || [],
        hourlyRate: f.hourlyRate,
        experience: f.experience || null,
        location: f.location || null,
        image: avatarUrl,
        portfolioUrls: f.portfolioUrls || [],
        completedContractsCount: f._count.freelancerContracts,
        averageRating: stats.avg,
        totalReviews: stats.count,
        createdAt: f.createdAt.toISOString(),
      };
    });

    // If sorting by rating, sort in memory
    if (sort === "rating") {
      freelancers.sort((a, b) => (b.averageRating ?? 0) - (a.averageRating ?? 0));
    }

    return {
      success: true,
      freelancers,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit) || 1,
      topSkills,
    };
  } catch (error) {
    console.error("[WorkPulse Search Freelancers Error]:", error);
    return {
      success: false,
      freelancers: [],
      totalCount: 0,
      page: 1,
      totalPages: 1,
      topSkills: [],
      error: "Failed to load freelancers catalogue.",
    };
  }
}

