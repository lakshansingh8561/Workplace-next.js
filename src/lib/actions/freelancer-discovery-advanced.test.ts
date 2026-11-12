/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { searchFreelancersAction } from "./freelancer-discovery";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    review: {
      groupBy: vi.fn(),
    },
  },
}));

describe("Phase 6: Advanced Freelancer Discovery & Search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseFreelancer = {
    id: "fl-alice-1",
    name: "Alice Engineer",
    title: "Senior Full-Stack Engineer",
    bio: "Passionate about React 19, Next.js, and TypeScript.",
    skills: ["React", "TypeScript", "Next.js"],
    hourlyRate: 75,
    experience: "5+ years",
    location: "San Francisco, CA",
    image: null,
    portfolioUrls: ["https://alice.dev"],
    isAvailable: true,
    createdAt: new Date("2026-01-10T10:00:00Z"),
    _count: {
      freelancerContracts: 12,
      reviewsReceived: 8,
    },
  };

  it("enforces strict privacy by excluding PRIVATE profiles and not leaking sensitive fields", async () => {
    (prisma.user.findMany as any)
      .mockResolvedValueOnce([baseFreelancer])
      .mockResolvedValueOnce([{ skills: ["React", "TypeScript"] }]);
    (prisma.user.count as any).mockResolvedValue(1);
    (prisma.review.groupBy as any).mockResolvedValue([
      { revieweeId: "fl-alice-1", _avg: { rating: 4.85 }, _count: { _all: 8 } },
    ]);

    const result = await searchFreelancersAction();

    expect(result.success).toBe(true);
    expect(result.freelancers).toHaveLength(1);

    // Verify findMany was called with NOT: { visibility: 'PRIVATE' }
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: "FREELANCER",
          roleSelected: true,
          NOT: { visibility: "PRIVATE" },
        }),
      })
    );

    // Verify user.count also excludes PRIVATE profiles
    expect(prisma.user.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: "FREELANCER",
          roleSelected: true,
          NOT: { visibility: "PRIVATE" },
        }),
      })
    );

    // Verify sensitive fields are not present on public card data
    const card = result.freelancers[0] as any;
    expect(card.email).toBeUndefined();
    expect(card.passwordHash).toBeUndefined();
    expect(card.resetToken).toBeUndefined();
    expect(card.role).toBeUndefined();
    expect(card.visibility).toBeUndefined();
    expect(card.isAvailable).toBe(true);
    expect(card.averageRating).toBe(4.9); // rounded to 1 decimal
    expect(card.totalReviews).toBe(8);
  });

  it("supports keyword search across name, title, bio, and skills", async () => {
    (prisma.user.findMany as any)
      .mockResolvedValueOnce([baseFreelancer])
      .mockResolvedValueOnce([]);
    (prisma.user.count as any).mockResolvedValue(1);
    (prisma.review.groupBy as any).mockResolvedValue([]);

    await searchFreelancersAction({ query: "Next.js" });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { name: { contains: "Next.js", mode: "insensitive" } },
            { title: { contains: "Next.js", mode: "insensitive" } },
            { bio: { contains: "Next.js", mode: "insensitive" } },
            { skills: { has: "Next.js" } },
          ],
        }),
      })
    );
  });

  it("filters by hourly rate range and normalizes minRate > maxRate if inverted", async () => {
    (prisma.user.findMany as any)
      .mockResolvedValueOnce([baseFreelancer])
      .mockResolvedValueOnce([]);
    (prisma.user.count as any).mockResolvedValue(1);
    (prisma.review.groupBy as any).mockResolvedValue([]);

    // Provide inverted range (minRate: 100, maxRate: 40)
    await searchFreelancersAction({ minRate: 100, maxRate: 40 });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          hourlyRate: {
            gte: 40,
            lte: 100,
          },
        }),
      })
    );
  });

  it("filters by professional experience and specific skill", async () => {
    (prisma.user.findMany as any)
      .mockResolvedValueOnce([baseFreelancer])
      .mockResolvedValueOnce([]);
    (prisma.user.count as any).mockResolvedValue(1);
    (prisma.review.groupBy as any).mockResolvedValue([]);

    await searchFreelancersAction({
      skill: "TypeScript",
      experience: "5+ years",
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          skills: { has: "TypeScript" },
          experience: { contains: "5+ years", mode: "insensitive" },
        }),
      })
    );
  });

  it("filters by availability using Phase 5 isAvailable field", async () => {
    (prisma.user.findMany as any)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (prisma.user.count as any).mockResolvedValue(0);

    // Test available filter
    await searchFreelancersAction({ isAvailable: true });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isAvailable: true,
        }),
      })
    );

    // Test unavailable/busy filter
    await searchFreelancersAction({ isAvailable: false });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isAvailable: false,
        }),
      })
    );
  });

  it("filters by minimum rating using verified reviews and does not invent fake 5.0 for unrated users", async () => {
    const unratedFreelancer = {
      ...baseFreelancer,
      id: "fl-bob-new",
      name: "Bob Newbie",
      _count: { freelancerContracts: 0, reviewsReceived: 0 },
    };

    // When filtering by minRating: 4.5
    (prisma.review.groupBy as any).mockResolvedValueOnce([
      { revieweeId: "fl-alice-1", _avg: { rating: 4.8 }, _count: { _all: 5 } },
      { revieweeId: "fl-charlie-low", _avg: { rating: 3.2 }, _count: { _all: 2 } },
    ]);
    (prisma.user.findMany as any)
      .mockResolvedValueOnce([baseFreelancer])
      .mockResolvedValueOnce([]);
    (prisma.user.count as any).mockResolvedValue(1);
    (prisma.review.groupBy as any).mockResolvedValueOnce([
      { revieweeId: "fl-alice-1", _avg: { rating: 4.8 }, _count: { _all: 5 } },
    ]);

    const ratedResult = await searchFreelancersAction({ minRating: 4.5 });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["fl-alice-1"] },
        }),
      })
    );
    expect(ratedResult.freelancers[0].averageRating).toBe(4.8);

    // Verify unrated freelancer returns averageRating: null
    (prisma.user.findMany as any)
      .mockResolvedValueOnce([unratedFreelancer])
      .mockResolvedValueOnce([]);
    (prisma.user.count as any).mockResolvedValue(1);
    (prisma.review.groupBy as any).mockResolvedValueOnce([]); // no reviews found

    const unratedResult = await searchFreelancersAction();
    expect(unratedResult.freelancers[0].averageRating).toBeNull();
    expect(unratedResult.freelancers[0].totalReviews).toBe(0);
  });

  it("sorts by hourly rate ascending and descending", async () => {
    (prisma.user.findMany as any)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (prisma.user.count as any).mockResolvedValue(0);

    // Rate ascending
    await searchFreelancersAction({ sort: "rate_asc" });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ hourlyRate: "asc" }, { createdAt: "desc" }],
      })
    );

    // Rate descending
    await searchFreelancersAction({ sort: "rate_desc" });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ hourlyRate: "desc" }, { createdAt: "desc" }],
      })
    );

    // Recent
    await searchFreelancersAction({ sort: "recent" });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "desc" }],
      })
    );
  });

  it("sorts displayed cards by rating descending with review count as tiebreaker", async () => {
    const rawList = [
      { ...baseFreelancer, id: "fl-1", name: "Freelancer 1" },
      { ...baseFreelancer, id: "fl-2", name: "Freelancer 2" },
      { ...baseFreelancer, id: "fl-3", name: "Freelancer 3" },
    ];

    (prisma.user.findMany as any)
      .mockResolvedValueOnce(rawList)
      .mockResolvedValueOnce([]);
    (prisma.user.count as any).mockResolvedValue(3);
    (prisma.review.groupBy as any).mockResolvedValueOnce([
      { revieweeId: "fl-1", _avg: { rating: 4.5 }, _count: { _all: 2 } },
      { revieweeId: "fl-2", _avg: { rating: 5.0 }, _count: { _all: 3 } },
      { revieweeId: "fl-3", _avg: { rating: 4.5 }, _count: { _all: 10 } }, // higher review count tiebreaker
    ]);

    const result = await searchFreelancersAction({ sort: "rating" });

    expect(result.success).toBe(true);
    expect(result.freelancers.map((f) => f.id)).toEqual(["fl-2", "fl-3", "fl-1"]);
  });

  it("calculates accurate pagination skip and total pages", async () => {
    (prisma.user.findMany as any)
      .mockResolvedValueOnce([baseFreelancer])
      .mockResolvedValueOnce([]);
    (prisma.user.count as any).mockResolvedValue(35); // 35 items total with limit 10 = 4 pages
    (prisma.review.groupBy as any).mockResolvedValue([]);

    const result = await searchFreelancersAction({ page: 3, limit: 10 });

    expect(result.page).toBe(3);
    expect(result.totalPages).toBe(4);
    expect(result.totalCount).toBe(35);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20, // (3 - 1) * 10
        take: 10,
      })
    );
  });

  it("handles errors gracefully without throwing uncaught exceptions", async () => {
    (prisma.user.findMany as any).mockRejectedValueOnce(new Error("Database connection dropped"));

    const result = await searchFreelancersAction();

    expect(result.success).toBe(false);
    expect(result.freelancers).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(result.error).toBe("Failed to load freelancers catalogue.");
  });
});

