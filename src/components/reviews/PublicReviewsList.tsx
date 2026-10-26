import { PublicReviewItem } from "@/lib/actions/review";
import { StaticStarRating } from "@/components/reviews/StarRating";

interface PublicReviewsListProps {
  reviews: PublicReviewItem[];
  averageRating: number | null;
  totalReviews: number;
  entityName?: string;
  entityType?: "Freelancer" | "Client";
}

export function PublicReviewsList({
  reviews,
  averageRating,
  totalReviews,
  entityName = "User",
  entityType = "Freelancer",
}: PublicReviewsListProps) {
  const hasReviews = totalReviews > 0 && reviews.length > 0;

  return (
    <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
      {/* Header & Rating Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800 pb-6">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-zinc-950 dark:text-white flex items-center gap-2">
            <span>⭐</span>
            <span>{entityType === "Client" ? "Freelancer Feedback & Ratings" : "Client & Contract Reviews"}</span>
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Verified feedback submitted upon completed contract agreements for this {entityType.toLowerCase()}.
          </p>
        </div>

        {/* Rating Badge */}
        <div className="flex items-center gap-3 bg-zinc-50 dark:bg-zinc-800/60 px-4 py-2.5 rounded-2xl border border-zinc-200/80 dark:border-zinc-700/60">
          <StaticStarRating
            rating={averageRating}
            count={totalReviews}
            showCount={true}
            size="md"
          />
        </div>
      </div>

      {/* Review List */}
      {!hasReviews ? (
        <div className="py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-xl text-zinc-400">
            💬
          </div>
          <h3 className="mt-3 text-sm font-bold text-zinc-900 dark:text-white">
            No reviews yet
          </h3>
          <p className="mt-1 text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed">
            {entityName} has not received post-contract reviews yet. Reviews will appear here once contracts are completed and evaluated.
          </p>
        </div>
      ) : (
        <div className="mt-6 divide-y divide-zinc-100 dark:divide-zinc-800">
          {reviews.map((review) => {
            const reviewerName =
              review.reviewer.name ||
              review.reviewer.companyName ||
              (review.reviewer.role === "CLIENT" ? "Client" : "Freelancer");
            const initials = reviewerName.slice(0, 2).toUpperCase();

            return (
              <div key={review.id} className="py-6 first:pt-2 last:pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 font-extrabold text-xs shadow-inner">
                      {initials}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-zinc-900 dark:text-white">
                          {reviewerName}
                        </p>
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          {review.reviewer.role === "CLIENT" ? "Client" : "Freelancer"}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400">
                        {new Date(review.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-amber-400 text-sm">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span
                        key={star}
                        className={
                          star <= review.rating
                            ? "text-amber-400"
                            : "text-zinc-200 dark:text-zinc-700"
                        }
                      >
                        ★
                      </span>
                    ))}
                    <span className="ml-1 text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      {review.rating}.0
                    </span>
                  </div>
                </div>

                {/* Contract Reference (Safe Title Only, No Financials/Bids) */}
                <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="font-semibold text-zinc-400">Contract:</span>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300 truncate max-w-md">
                    {review.contract.title}
                  </span>
                </div>

                {/* Written Feedback */}
                <p className="mt-2 text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                  {review.feedback}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
