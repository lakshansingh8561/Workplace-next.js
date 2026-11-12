"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { Role } from "@prisma/client";

export interface RecommendedJobItem {
  id: string;
  title: string;
  description: string;
  category: string;
  skills: string[];
  type: string;
  budget: number | null;
  hourlyMin: number | null;
  hourlyMax: number | null;
  duration: string | null;
  experienceLevel: string;
  proposalsCount: number;
  createdAt: string;
  clientName: string | null;
  clientCountry: string | null;
  clientRating: number | null;
  matchScore: number;
  matchingSkills: string[];
  matchReasons: string[];
}

export interface GetRecommendedJobsResult {
  success: boolean;
  recommendedJobs: RecommendedJobItem[];
  freelancerSkills: string[];
  isPersonalized: boolean;
  error?: string;
}

/**
 * Derives explainable, database-driven job recommendations for the authenticated freelancer.
 * Matches based on:
 * 1. Skill overlap (real freelancer skills vs job requirements).
 * 2. Category relevance.
 * 3. Experience level alignment.
 * Strictly excludes jobs the freelancer has already applied to.
 */
export async function getRecommendedJobsAction(
  options?: { limit?: number }
): Promise<GetRecommendedJobsResult> {
  const limit = Math.min(Math.max(options?.limit || 6, 1), 20);

  try {
    const user = await getCurrentUser();

    // If not signed in or not a freelancer, return newest open jobs
    if (!user || user.role !== Role.FREELANCER) {
      const genericJobs = await prisma.job.findMany({
        where: { status: "OPEN" },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          title: true,
          description: true,
          category: true,
          skills: true,
          type: true,
          budget: true,
          hourlyMin: true,
          hourlyMax: true,
          duration: true,
          experienceLevel: true,
          proposalsCount: true,
          createdAt: true,
          clientName: true,
          clientCountry: true,
          clientRating: true,
        },
      });

      return {
        success: true,
        recommendedJobs: genericJobs.map((j) => ({
          ...j,
          createdAt: j.createdAt.toISOString(),
          matchScore: 0,
          matchingSkills: [],
          matchReasons: ["Recently posted open opportunity"],
        })),
        freelancerSkills: [],
        isPersonalized: false,
      };
    }

    // 1. Fetch freelancer's complete profile
    const freelancer = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        skills: true,
        experience: true,
        title: true,
        bio: true,
      },
    });

    const freelancerSkills = freelancer?.skills || [];
    const normalizedFreelancerSkills = freelancerSkills.map((s) => s.toLowerCase().trim());

    // 2. Fetch jobs already applied to
    const existingProposals = await prisma.proposal.findMany({
      where: { freelancerId: user.id },
      select: { jobId: true },
    });
    const appliedJobIds = new Set(existingProposals.map((p) => p.jobId));

    // 3. Query candidate open jobs
    const candidateJobs = await prisma.job.findMany({
      where: {
        status: "OPEN",
        id: { notIn: Array.from(appliedJobIds) },
      },
      orderBy: { createdAt: "desc" },
      take: 60, // Pool size for scoring
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        skills: true,
        type: true,
        budget: true,
        hourlyMin: true,
        hourlyMax: true,
        duration: true,
        experienceLevel: true,
        proposalsCount: true,
        createdAt: true,
        clientName: true,
        clientCountry: true,
        clientRating: true,
      },
    });

    // 4. Score each candidate job explainably
    const scoredJobs = candidateJobs.map((job) => {
      let score = 0;
      const reasons: string[] = [];
      const matchingSkills: string[] = [];

      // A. Skill Match (up to 60 points)
      const jobSkills = job.skills || [];
      if (jobSkills.length > 0 && normalizedFreelancerSkills.length > 0) {
        jobSkills.forEach((js) => {
          if (normalizedFreelancerSkills.includes(js.toLowerCase().trim())) {
            matchingSkills.push(js);
          }
        });

        if (matchingSkills.length > 0) {
          const matchRatio = matchingSkills.length / jobSkills.length;
          const skillPoints = Math.round(matchRatio * 60);
          score += skillPoints;
          reasons.push(
            `Matches ${matchingSkills.length} of your skills (${matchingSkills.slice(0, 3).join(", ")})`
          );
        }
      }

      // B. Category Affinity (up to 25 points)
      const titleBio = `${freelancer?.title || ""} ${freelancer?.bio || ""}`.toLowerCase();
      if (titleBio.includes(job.category.toLowerCase())) {
        score += 25;
        reasons.push(`Relevant to your background in ${job.category}`);
      }

      // C. Experience Alignment (up to 15 points)
      if (freelancer?.experience && job.experienceLevel) {
        const expLower = freelancer.experience.toLowerCase();
        if (
          (job.experienceLevel === "ENTRY" && (expLower.includes("entry") || expLower.includes("1-"))) ||
          (job.experienceLevel === "INTERMEDIATE" && (expLower.includes("intermediate") || expLower.includes("3-"))) ||
          (job.experienceLevel === "EXPERT" && (expLower.includes("senior") || expLower.includes("expert") || expLower.includes("5+")))
        ) {
          score += 15;
          reasons.push(`Aligned with your ${job.experienceLevel.toLowerCase()} experience level`);
        }
      }

      // Default reason if score is low
      if (reasons.length === 0) {
        reasons.push(`Active contract matching your marketplace interests`);
      }

      return {
        ...job,
        createdAt: job.createdAt.toISOString(),
        matchScore: Math.min(score, 100),
        matchingSkills,
        matchReasons: reasons,
      };
    });

    // Sort by match score descending, then newest
    scoredJobs.sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return {
      success: true,
      recommendedJobs: scoredJobs.slice(0, limit),
      freelancerSkills,
      isPersonalized: freelancerSkills.length > 0,
    };
  } catch (error) {
    console.error("[WorkPulse Recommended Jobs Error]:", error);
    return {
      success: false,
      recommendedJobs: [],
      freelancerSkills: [],
      isPersonalized: false,
      error: "Failed to generate job recommendations.",
    };
  }
}

