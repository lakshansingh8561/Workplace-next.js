"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  ReviewSubmissionSchema,
  ReviewUpdateSchema,
} from "@/lib/validations/review";
import { ContractStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { isValidObjectId } from "@/lib/jobs";

export interface PublicReviewItem {
  id: string;
  rating: number;
  feedback: string;
  createdAt: string;
  updatedAt: string;
  reviewer: {
    id: string;
    name: string | null;
    image: string | null;
    role: string;
    companyName?: string | null;
  };
  contract: {
    id: string;
    title: string;
  };
}

export interface UserReviewsSummary {
  averageRating: number | null; // null if 0 reviews to avoid fabricated rating
  totalReviews: number;
  reviews: PublicReviewItem[];
}

export interface ContractReviewData {
  myReview: PublicReviewItem | null;
  counterpartReview: PublicReviewItem | null;
  canReview: boolean;
  reasonCannotReview?: string;
}

export type ReviewActionResult<T = unknown> = {
  success: boolean;
  review?: T;
  error?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Server action to submit a review for a completed contract.
 * Derives reviewer identity strictly from verified server session.
 * Enforces contract completion, participant authorization, and uniqueness.
 */
export async function submitReviewAction(
  input: unknown
): Promise<ReviewActionResult> {
  const sessionUser = await getCurrentUser();

  if (!sessionUser) {
    return {
      success: false,
      error: "Authentication required to submit a review.",
    };
  }

  const parsed = ReviewSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      const field = issue.path[0];
      if (field) {
        fieldErrors[String(field)] = issue.message;
      }
    });

    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Validation failed.",
      fieldErrors,
    };
  }

  const { contractId, rating, feedback } = parsed.data;

  try {
    // 1. Fetch contract and verify existence & status
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        title: true,
        status: true,
        clientId: true,
        freelancerId: true,
      },
    });

    if (!contract) {
      return {
        success: false,
        error: "Contract not found or has been deleted.",
      };
    }

    // 2. Strict status check: Contract MUST be COMPLETED
    if (contract.status !== ContractStatus.COMPLETED) {
      return {
        success: false,
        error: `Reviews are only permitted for completed contracts. Current contract status is ${contract.status.toLowerCase()}.`,
      };
    }

    // 3. Strict participant check: Only client or freelancer on this contract may review
    const isClient = contract.clientId === sessionUser.id;
    const isFreelancer = contract.freelancerId === sessionUser.id;

    if (!isClient && !isFreelancer) {
      return {
        success: false,
        error: "Unauthorized: You are not a participant in this contract agreement.",
      };
    }

    // 4. Determine reviewee
    const reviewerId = sessionUser.id;
    const revieweeId = isClient ? contract.freelancerId : contract.clientId;

    if (reviewerId === revieweeId) {
      return {
        success: false,
        error: "Self-reviews are strictly forbidden.",
      };
    }

    // 5. Check if review already exists
    const existing = await prisma.review.findUnique({
      where: {
        contractId_reviewerId: {
          contractId: contract.id,
          reviewerId,
        },
      },
      select: { id: true },
    });

    if (existing) {
      return {
        success: false,
        error: "You have already submitted a review for this contract.",
      };
    }

    // 6. Create the review
    const created = await prisma.review.create({
      data: {
        contractId: contract.id,
        reviewerId,
        revieweeId,
        rating,
        feedback,
      },
      select: {
        id: true,
        contractId: true,
        reviewerId: true,
        revieweeId: true,
        rating: true,
        feedback: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Revalidate relevant pages
    revalidatePath(`/contracts/${contract.id}`);
    revalidatePath(`/freelancers/${revieweeId}`);
    revalidatePath(`/profile/client`);
    revalidatePath(`/profile/freelancer`);
    revalidatePath("/dashboard/client");
    revalidatePath("/dashboard/freelancer/proposals");

    return {
      success: true,
      review: {
        id: created.id,
        rating: created.rating,
        feedback: created.feedback,
        createdAt: created.createdAt.toISOString(),
      },
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        success: false,
        error: "You have already submitted a review for this contract.",
      };
    }

    console.error("[WorkPulse Submit Review Error]:", error);
    return {
      success: false,
      error: "An unexpected database error occurred while submitting your review.",
    };
  }
}

/**
 * Server action to edit an existing review.
 * Only the original reviewer may update their review.
 */
export async function updateReviewAction(
  input: unknown
): Promise<ReviewActionResult> {
  const sessionUser = await getCurrentUser();

  if (!sessionUser) {
    return {
      success: false,
      error: "Authentication required to edit a review.",
    };
  }

  const parsed = ReviewUpdateSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      const field = issue.path[0];
      if (field) {
        fieldErrors[String(field)] = issue.message;
      }
    });

    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Validation failed.",
      fieldErrors,
    };
  }

  const { reviewId, rating, feedback } = parsed.data;

  try {
    const existing = await prisma.review.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        reviewerId: true,
        revieweeId: true,
        contractId: true,
      },
    });

    if (!existing) {
      return {
        success: false,
        error: "Review not found or has been removed.",
      };
    }

    if (existing.reviewerId !== sessionUser.id) {
      return {
        success: false,
        error: "Unauthorized: You can only edit your own reviews.",
      };
    }

    const updated = await prisma.review.update({
      where: { id: reviewId },
      data: {
        rating,
        feedback,
      },
      select: {
        id: true,
        rating: true,
        feedback: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    revalidatePath(`/contracts/${existing.contractId}`);
    revalidatePath(`/freelancers/${existing.revieweeId}`);
    revalidatePath(`/profile/client`);
    revalidatePath(`/profile/freelancer`);

    return {
      success: true,
      review: {
        id: updated.id,
        rating: updated.rating,
        feedback: updated.feedback,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  } catch (error) {
    console.error("[WorkPulse Update Review Error]:", error);
    return {
      success: false,
      error: "An unexpected database error occurred while updating your review.",
    };
  }
}

/**
 * Retrieves the reviews for a specific contract from the perspective of the current user.
 */
export async function getContractReviewsData(
  contractId: string,
  currentUserId?: string
): Promise<ContractReviewData> {
  if (!contractId || !isValidObjectId(contractId)) {
    return {
      myReview: null,
      counterpartReview: null,
      canReview: false,
      reasonCannotReview: "Invalid contract ID.",
    };
  }

  try {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        status: true,
        clientId: true,
        freelancerId: true,
        reviews: {
          select: {
            id: true,
            rating: true,
            feedback: true,
            createdAt: true,
            updatedAt: true,
            reviewerId: true,
            reviewer: {
              select: {
                id: true,
                name: true,
                image: true,
                role: true,
                companyName: true,
              },
            },
            contract: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
    });

    if (!contract) {
      return {
        myReview: null,
        counterpartReview: null,
        canReview: false,
        reasonCannotReview: "Contract not found.",
      };
    }

    const isMember =
      currentUserId &&
      (contract.clientId === currentUserId ||
        contract.freelancerId === currentUserId);

    if (!isMember) {
      return {
        myReview: null,
        counterpartReview: null,
        canReview: false,
        reasonCannotReview: "You are not a participant on this contract.",
      };
    }

    const myReviewRaw = contract.reviews.find(
      (r) => r.reviewerId === currentUserId
    );
    const counterpartReviewRaw = contract.reviews.find(
      (r) => r.reviewerId !== currentUserId
    );

    const formatReview = (
      r: NonNullable<typeof myReviewRaw>
    ): PublicReviewItem => ({
      id: r.id,
      rating: r.rating,
      feedback: r.feedback,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      reviewer: {
        id: r.reviewer.id,
        name: r.reviewer.name || (r.reviewer.role === "CLIENT" ? "Client" : "Freelancer"),
        image: r.reviewer.image,
        role: r.reviewer.role,
        companyName: r.reviewer.companyName,
      },
      contract: {
        id: r.contract.id,
        title: r.contract.title,
      },
    });

    const isCompleted = contract.status === ContractStatus.COMPLETED;
    const canReview = isCompleted && !myReviewRaw;

    let reasonCannotReview: string | undefined;
    if (!isCompleted) {
      reasonCannotReview = `Contract is currently ${contract.status.toLowerCase()}. Reviews can only be submitted once the contract is completed.`;
    } else if (myReviewRaw) {
      reasonCannotReview = "You have already submitted your review for this contract.";
    }

    return {
      myReview: myReviewRaw ? formatReview(myReviewRaw) : null,
      counterpartReview: counterpartReviewRaw
        ? formatReview(counterpartReviewRaw)
        : null,
      canReview,
      reasonCannotReview,
    };
  } catch (error) {
    console.error("[WorkPulse Get Contract Reviews Data Error]:", error);
    return {
      myReview: null,
      counterpartReview: null,
      canReview: false,
      reasonCannotReview: "Failed to load review details.",
    };
  }
}

/**
 * Safely fetches public reviews and rating summary for a user (freelancer or client).
 * Computes actual database average and count.
 * Excludes email addresses, passwords, tokens, bid amounts, and private contract data.
 */
export async function getUserReviewsSummary(
  userId: string
): Promise<UserReviewsSummary> {
  if (!userId || !isValidObjectId(userId)) {
    return {
      averageRating: null,
      totalReviews: 0,
      reviews: [],
    };
  }

  try {
    const [aggregate, reviews] = await Promise.all([
      prisma.review.aggregate({
        where: { revieweeId: userId },
        _avg: { rating: true },
        _count: { rating: true },
      }),
      prisma.review.findMany({
        where: { revieweeId: userId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          rating: true,
          feedback: true,
          createdAt: true,
          updatedAt: true,
          reviewer: {
            select: {
              id: true,
              name: true,
              image: true,
              role: true,
              companyName: true,
            },
          },
          contract: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      }),
    ]);

    const count = aggregate._count.rating || 0;
    const rawAvg = aggregate._avg.rating;
    const averageRating =
      count > 0 && typeof rawAvg === "number"
        ? Math.round(rawAvg * 10) / 10
        : null;

    const formattedReviews: PublicReviewItem[] = reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      feedback: r.feedback,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      reviewer: {
        id: r.reviewer.id,
        name:
          r.reviewer.name ||
          (r.reviewer.role === "CLIENT"
            ? r.reviewer.companyName || "Client"
            : "Freelancer"),
        image: r.reviewer.image,
        role: r.reviewer.role,
        companyName: r.reviewer.companyName,
      },
      contract: {
        id: r.contract.id,
        title: r.contract.title,
      },
    }));

    return {
      averageRating,
      totalReviews: count,
      reviews: formattedReviews,
    };
  } catch (error) {
    console.error("[WorkPulse Get User Reviews Summary Error]:", error);
    return {
      averageRating: null,
      totalReviews: 0,
      reviews: [],
    };
  }
}
