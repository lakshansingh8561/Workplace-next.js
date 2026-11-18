"use client";

import { useState } from "react";
import { MilestoneSubmission } from "@/types";
import { formatDate } from "@/lib/utils";

interface MilestoneDeliverablesViewerProps {
  submissions: MilestoneSubmission[];
  milestoneStatus: string;
  isClient: boolean;
  isFreelancer: boolean;
  onApprove?: () => void;
  onRequestChanges?: () => void;
  onResubmit?: () => void;
  isProcessing?: boolean;
}

export function MilestoneDeliverablesViewer({
  submissions,
  milestoneStatus,
  isClient,
  isFreelancer,
  onApprove,
  onRequestChanges,
  onResubmit,
  isProcessing = false,
}: MilestoneDeliverablesViewerProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  if (!submissions || submissions.length === 0) {
    return null;
  }

  const latestSubmission = submissions[submissions.length - 1];
  const previousSubmissions = submissions.slice(0, submissions.length - 1);

  return (
    <div className="mt-4 rounded-2xl border border-zinc-200/90 dark:border-zinc-850 bg-zinc-50/70 dark:bg-zinc-850/40 p-4 sm:p-5 space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/60 dark:border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">📦</span>
          <span className="text-xs font-extrabold text-zinc-900 dark:text-white uppercase tracking-wider">
            Submitted Deliverable
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              milestoneStatus === "APPROVED"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : milestoneStatus === "REVISION_REQUESTED"
                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
            }`}
          >
            {milestoneStatus === "APPROVED"
              ? "Approved"
              : milestoneStatus === "REVISION_REQUESTED"
              ? "Revisions Requested"
              : "In Review"}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span>Submitted {formatDate(latestSubmission.submittedAt)}</span>
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            {isExpanded ? "Collapse ▲" : "View Details ▼"}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-4">
          {/* Work Completion Description */}
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
              Completed Work Description
            </span>
            <p className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap bg-white dark:bg-zinc-900 p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
              {latestSubmission.description}
            </p>
          </div>

          {/* Attachments Section */}
          {latestSubmission.attachments && latestSubmission.attachments.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                Work Evidence & Screenshots ({latestSubmission.attachments.length})
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {latestSubmission.attachments.map((att, idx) => {
                  const isImage = att.fileType.startsWith("image/");
                  return (
                    <div
                      key={att.id || idx}
                      className="group relative rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden shadow-xs hover:border-emerald-500 transition"
                    >
                      {isImage ? (
                        <div
                          className="cursor-pointer relative aspect-video bg-zinc-100 dark:bg-zinc-800 overflow-hidden"
                          onClick={() => setSelectedImage(att.fileUrl)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={att.fileUrl}
                            alt={att.fileName}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-bold">
                            🔍 Preview
                          </div>
                        </div>
                      ) : (
                        <a
                          href={att.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex flex-col items-center justify-center p-3 text-center aspect-video hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
                        >
                          <span className="text-2xl mb-1">📄</span>
                          <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 truncate w-full">
                            PDF Document
                          </span>
                        </a>
                      )}
                      <div className="p-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-[11px]">
                        <span className="truncate font-medium text-zinc-700 dark:text-zinc-300">
                          {att.fileName}
                        </span>
                        <a
                          href={att.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={att.fileName}
                          className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 font-bold ml-1 shrink-0"
                          title="Open or Download"
                        >
                          ↗
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Deliverable Links Section */}
          {latestSubmission.links && latestSubmission.links.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                Deliverable & Live Links ({latestSubmission.links.length})
              </span>
              <div className="flex flex-wrap gap-2">
                {latestSubmission.links.map((link, idx) => (
                  <a
                    key={link.id || idx}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition shadow-xs"
                  >
                    <span>🔗</span>
                    <span>{link.title || "Live Link"}</span>
                    <span className="text-zinc-400">↗</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Revision Feedback Banner if Client requested changes */}
          {latestSubmission.revisionFeedback && (
            <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-4 space-y-1">
              <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold text-xs">
                <span>⚠️</span>
                <span>Client Requested Changes / Revision Feedback:</span>
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed whitespace-pre-wrap pl-6">
                {latestSubmission.revisionFeedback}
              </p>
            </div>
          )}

          {/* History of Previous Submissions */}
          {previousSubmissions.length > 0 && (
            <details className="text-xs text-zinc-500 pt-1">
              <summary className="cursor-pointer font-bold hover:text-zinc-700 dark:hover:text-zinc-300">
                View Previous Submissions ({previousSubmissions.length})
              </summary>
              <div className="mt-2 space-y-3 pl-2 border-l-2 border-zinc-200 dark:border-zinc-800">
                {previousSubmissions.map((prevSub, pIdx) => (
                  <div key={prevSub.id || pIdx} className="space-y-1">
                    <div className="flex items-center gap-2 font-semibold text-[11px] text-zinc-600 dark:text-zinc-400">
                      <span>Round #{pIdx + 1}</span>
                      <span>•</span>
                      <span>{formatDate(prevSub.submittedAt)}</span>
                      {prevSub.revisionFeedback && (
                        <span className="text-amber-600 font-bold">(Revision)</span>
                      )}
                    </div>
                    <p className="text-zinc-700 dark:text-zinc-300 line-clamp-2">
                      {prevSub.description}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-zinc-200/80 dark:border-zinc-800">
            {/* If Client and Milestone is SUBMITTED */}
            {isClient && milestoneStatus === "SUBMITTED" && (
              <>
                {onRequestChanges && (
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={onRequestChanges}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50/80 dark:border-amber-700 dark:bg-amber-950/40 px-3.5 py-2 text-xs font-bold text-amber-800 dark:text-amber-300 hover:bg-amber-100 transition disabled:opacity-50"
                  >
                    <span>⚠️</span>
                    <span>Request Changes</span>
                  </button>
                )}
                {onApprove && (
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={onApprove}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition disabled:opacity-50 active:scale-95"
                  >
                    <span>✓</span>
                    <span>{isProcessing ? "Approving..." : "Approve Milestone"}</span>
                  </button>
                )}
              </>
            )}

            {/* If Freelancer and Revisions were requested */}
            {isFreelancer && milestoneStatus === "REVISION_REQUESTED" && onResubmit && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={onResubmit}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition disabled:opacity-50 active:scale-95"
              >
                <span>🚀</span>
                <span>Resubmit Deliverable</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Image Lightbox Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl p-2 border border-zinc-700"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 z-10 rounded-full bg-black/60 p-2 text-white hover:bg-black/90 transition"
            >
              ✕
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedImage}
              alt="deliverable proof preview"
              className="max-h-[85vh] w-auto max-w-full rounded-2xl object-contain mx-auto"
            />
          </div>
        </div>
      )}
    </div>
  );
}

