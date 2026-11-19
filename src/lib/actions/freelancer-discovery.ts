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
  isAvailable: boolean;
  createdAt: string;
}

export interface SearchFreelancersOptions {
  query?: string;
  skill?: string;
  minRate?: number;
  maxRate?: number;
  experience?: string;
  isAvailable?: boolean;
  minRating?: number;
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
 * Strictly enforces public privacy: excludes private profiles, emails, credentials, and private records.
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
    let minRate =
      options?.minRate !== undefined && !isNaN(Number(options.minRate))
        ? Math.max(0, Number(options.minRate))
        : undefined;
    let maxRate =
      options?.maxRate !== undefined && !isNaN(Number(options.maxRate))
        ? Math.max(0, Number(options.maxRate))
        : undefined;

    if (minRate !== undefined && maxRate !== undefined && minRate > maxRate) {
      const temp = minRate;
      minRate = maxRate;
      maxRate = temp;
    }

    const experience = options?.experience?.trim();
    const isAvailable = options?.isAvailable;
    const minRating =
      options?.minRating !== undefined && !isNaN(Number(options.minRating))
        ? Math.max(0, Number(options.minRating))
        : undefined;
    const sort = options?.sort || "rating";

    // Build Prisma filter: Always restrict to active, public freelancers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      role: "FREELANCER",
      roleSelected: true,
      NOT: {
        visibility: "PRIVATE",
      },
    };

    // Keyword search across Name, Title, Bio, and Skills
    if (query) {
      where.OR = [
        { name: { contains: query, mode: "insensitive" } },
        { title: { contains: query, mode: "insensitive" } },
        { bio: { contains: query, mode: "insensitive" } },
        { skills: { has: query } },
      ];
    }

    // Skill filter
    if (skill && skill !== "ALL") {
      where.skills = { has: skill };
    }

    // Experience filter
    if (experience && experience !== "ALL") {
      where.experience = { contains: experience, mode: "insensitive" };
    }

    // Availability filter (Phase 5 isAvailable integration)
    if (isAvailable !== undefined) {
      where.isAvailable = isAvailable;
    }

    // Hourly rate range filtering
    if (minRate !== undefined || maxRate !== undefined) {
      where.hourlyRate = {};
      if (minRate !== undefined) {
        where.hourlyRate.gte = minRate;
      }
      if (maxRate !== undefined) {
        where.hourlyRate.lte = maxRate;
      }
    }

    // Rating filtering using verified client reviews
    if (minRating !== undefined && minRating > 0) {
      const allReviewStats = await prisma.review.groupBy({
        by: ["revieweeId"],
        _avg: { rating: true },
        _count: { _all: true },
      });

      const qualifyingIds = (allReviewStats || [])
        .filter((r) => (r._avg?.rating ?? 0) >= minRating)
        .map((r) => r.revieweeId);

      where.id = { in: qualifyingIds };
    }

    // Standard Prisma orderBy
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
          isAvailable: true,
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
        where: { role: "FREELANCER", NOT: { visibility: "PRIVATE" } },
        select: { skills: true },
        take: 100,
      }),
    ]);

    // Top skills query: Sample skills across public freelancers for filter pills
    const skillCountMap = new Map<string, number>();
    (allUsersSkills || []).forEach((u) => {
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

    // Fetch review ratings for the displayed freelancers on this page
    const freelancerIds = (rawFreelancers || []).map((f) => f.id);
    let ratingMap = new Map<string, { avg: number | null; count: number }>();

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
        (reviewStats || []).map((r) => [
          r.revieweeId,
          {
            avg: r._avg?.rating ? Math.round(r._avg.rating * 10) / 10 : null,
            count: r._count?._all || 0,
          },
        ])
      );
    }

    const freelancers: PublicFreelancerCardData[] = (rawFreelancers || []).map((f) => {
      const stats = ratingMap.get(f.id) || {
        avg: null,
        count: f._count?.reviewsReceived || 0,
      };
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
        completedContractsCount: f._count?.freelancerContracts || 0,
        averageRating: stats.avg,
        totalReviews: stats.count,
        isAvailable: f.isAvailable ?? true,
        createdAt: f.createdAt ? new Date(f.createdAt).toISOString() : new Date().toISOString(),
      };
    });

    // If sorting by rating, sort displayed items by rating descending
    if (sort === "rating") {
      freelancers.sort((a, b) => {
        const ratingA = a.averageRating ?? 0;
        const ratingB = b.averageRating ?? 0;
        if (ratingB !== ratingA) return ratingB - ratingA;
        return (b.totalReviews ?? 0) - (a.totalReviews ?? 0);
      });
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
