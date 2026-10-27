"use client";

import { useState, useTransition } from "react";
import {
  submitReviewAction,
  updateReviewAction,
  PublicReviewItem,
  ContractReviewData,
} from "@/lib/actions/review";
import { InteractiveStarRating } from "@/components/reviews/StarRating";
import { useRouter } from "next/navigation";

interface ContractReviewSectionProps {
  contractId: string;
  contractTitle: string;
  contractStatus: string;
  counterpartName: string;
  counterpartRole: "Client" | "Freelancer";
  initialReviewData: ContractReviewData;
}

export function ContractReviewSection({
  contractId,
  contractStatus,
  counterpartName,
  counterpartRole,
  initialReviewData,
}: ContractReviewSectionProps) {
  const router = useRouter();
  const [reviewData, setReviewData] = useState<ContractReviewData>(initialReviewData);
  const [rating, setRating] = useState<number>(5);
  const [feedback, setFeedback] = useState<string>("");
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editRating, setEditRating] = useState<number>(
    initialReviewData.myReview?.rating || 5
  );
  const [editFeedback, setEditFeedback] = useState<string>(
    initialReviewData.myReview?.feedback || ""
  );

  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isCompleted = contractStatus === "COMPLETED";

  const handleSubmitNew = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    if (rating < 1 || rating > 5) {
      setFormError("Please select a rating between 1 and 5 stars.");
      return;
    }

    if (!feedback.trim() || feedback.trim().length < 5) {
      setFormError("Feedback must be at least 5 characters long.");
      return;
    }

    startTransition(async () => {
      const res = await submitReviewAction({
        contractId,
        rating,
        feedback: feedback.trim(),
      });

      if (!res.success) {
        setFormError(res.error || "Failed to submit review.");
      } else {
        setSuccessMessage("Your review has been successfully published!");
        setFeedback("");
        router.refresh();
      }
    });
  };

  const handleUpdateReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewData.myReview) return;
    setFormError(null);
    setSuccessMessage(null);

    if (editRating < 1 || editRating > 5) {
      setFormError("Please select a rating between 1 and 5 stars.");
      return;
    }

    if (!editFeedback.trim() || editFeedback.trim().length < 5) {
      setFormError("Feedback must be at least 5 characters long.");
      return;
    }

    startTransition(async () => {
      const res = await updateReviewAction({
        reviewId: reviewData.myReview!.id,
        rating: editRating,
        feedback: editFeedback.trim(),
      });

      if (!res.success) {
        setFormError(res.error || "Failed to update review.");
      } else {
        setSuccessMessage("Your review has been successfully updated!");
        setIsEditing(false);
        setReviewData((prev) => ({
          ...prev,
          myReview: prev.myReview
            ? {
                ...prev.myReview,
                rating: editRating,
                feedback: editFeedback.trim(),
                updatedAt: new Date().toISOString(),
              }
            : null,
        }));
        router.refresh();
      }
    });
  };

  const renderReviewCard = (review: PublicReviewItem, isSelf: boolean) => (
    <div
      key={review.id}
      className={`rounded-2xl p-5 border ${
        isSelf
          ? "border-emerald-200/80 bg-emerald-50/30 dark:border-emerald-900/50 dark:bg-emerald-950/20"
          : "border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-800/40"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-200 dark:bg-zinc-700 text-sm font-bold text-zinc-800 dark:text-zinc-200">
            {(review.reviewer.name || "U").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-bold text-zinc-900 dark:text-white">
              {isSelf ? "Your Review" : review.reviewer.name || `${counterpartRole}`}
            </p>
            <p className="text-[11px] text-zinc-500" suppressHydrationWarning>
              {new Date(review.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              })}
              {review.updatedAt !== review.createdAt && " (edited)"}
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
                  : "text-zinc-300 dark:text-zinc-700"
              }
            >
              ★
            </span>
          ))}
          <span className="ml-1 text-xs font-bold text-zinc-700 dark:text-zinc-300">
            {review.rating}/5
          </span>
        </div>
      </div>

      <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
        {review.feedback}
      </p>

      {isSelf && !isEditing && (
        <div className="mt-4 pt-3 border-t border-emerald-100 dark:border-emerald-900/40 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setIsEditing(true);
              setEditRating(review.rating);
              setEditFeedback(review.feedback);
              setFormError(null);
            }}
            className="text-xs font-bold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 inline-flex items-center gap-1 transition"
          >
            ✏️ Edit Your Feedback
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800 pb-5">
        <div>
          <h2 className="text-lg font-extrabold text-zinc-950 dark:text-white flex items-center gap-2">
            <span>⭐</span>
            <span>Contract Ratings & Reviews</span>
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Post-contract feedback for deliverables on this agreement.
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
            isCompleted
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
              : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
          }`}
        >
          {isCompleted ? "Completed — Reviews Open" : `Status: ${contractStatus}`}
        </span>
      </div>

      {/* Messages */}
      {formError && (
        <div className="mt-4 rounded-2xl bg-rose-50 p-4 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-900">
          ⚠️ {formError}
        </div>
      )}

      {successMessage && (
        <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900">
          ✓ {successMessage}
        </div>
      )}

      {/* Reviews Display */}
      <div className="mt-6 space-y-4">
        {reviewData.myReview && !isEditing && renderReviewCard(reviewData.myReview, true)}

        {/* Edit Review Form */}
        {reviewData.myReview && isEditing && (
          <form
            onSubmit={handleUpdateReview}
            className="rounded-2xl border border-emerald-300 bg-white p-6 shadow-sm dark:border-emerald-800 dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                Edit Your Review for {counterpartName}
              </h3>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                Cancel
              </button>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Rating
              </label>
              <InteractiveStarRating
                value={editRating}
                onChange={setEditRating}
                disabled={isPending}
              />
            </div>

            <div className="mt-4">
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Written Feedback
              </label>
              <textarea
                value={editFeedback}
                onChange={(e) => setEditFeedback(e.target.value)}
                maxLength={2000}
                rows={4}
                disabled={isPending}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-900 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                placeholder="Share your experience working with this party..."
              />
              <div className="flex justify-between text-[11px] text-zinc-400 mt-1">
                <span>Min 5 characters</span>
                <span>{editFeedback.length}/2000</span>
              </div>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition disabled:opacity-50"
              >
                {isPending ? "Saving..." : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                disabled={isPending}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {reviewData.counterpartReview &&
          renderReviewCard(reviewData.counterpartReview, false)}
      </div>

      {/* New Review Form if Eligible and not yet reviewed */}
      {reviewData.canReview && (
        <form
          onSubmit={handleSubmitNew}
          className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 p-6 dark:border-zinc-700 dark:bg-zinc-800/40"
        >
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold text-zinc-950 dark:text-white">
              Leave a Review for {counterpartName} ({counterpartRole})
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Your honest feedback helps maintain quality and reputation across WorkPulse.
            </p>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              Select Rating (1 to 5 Stars) *
            </label>
            <InteractiveStarRating
              value={rating}
              onChange={setRating}
              disabled={isPending}
            />
          </div>

          <div className="mt-4">
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              Written Feedback *
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              maxLength={2000}
              rows={4}
              disabled={isPending}
              required
              className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-900 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
              placeholder={`How was your experience collaborating with ${counterpartName}? Provide helpful details regarding communication, delivery, and professionalism.`}
            />
            <div className="flex justify-between text-[11px] text-zinc-400 mt-1">
              <span>Minimum 5 characters</span>
              <span>{feedback.length}/2000</span>
            </div>
          </div>

          <div className="mt-5">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-emerald-500 transition disabled:opacity-50"
            >
              {isPending ? "Submitting Review..." : "Submit Review ⭐"}
            </button>
          </div>
        </form>
      )}

      {/* Info state if not eligible to review */}
      {!reviewData.canReview && !reviewData.myReview && (
        <div className="mt-4 rounded-2xl bg-zinc-50 p-4 text-xs text-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-400 border border-zinc-200/80 dark:border-zinc-800">
          ℹ️ {reviewData.reasonCannotReview || "Reviews are only available once this contract is marked completed."}
        </div>
      )}
    </div>
  );
}
