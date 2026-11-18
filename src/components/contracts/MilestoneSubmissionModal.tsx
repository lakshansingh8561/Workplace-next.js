"use client";

import { useState } from "react";
import { submitMilestoneAction } from "@/lib/actions/contract";
import { formatDate } from "@/lib/utils";

interface AttachmentItem {
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  storageProvider?: string | null;
}

interface LinkItem {
  title: string;
  url: string;
}

interface MilestoneSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  milestone: {
    id: string;
    title: string;
    description?: string | null;
    amount: number;
    dueDate?: string | null;
    status: string;
  };
  contractTitle: string;
  onSuccess: (milestoneId: string) => void;
}

export function MilestoneSubmissionModal({
  isOpen,
  onClose,
  milestone,
  contractTitle,
  onSuccess,
}: MilestoneSubmissionModalProps) {
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([
    { title: "Project Link", url: "" },
  ]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadError(null);
    setIsUploading(true);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Client-side quick checks
        if (file.size > 10 * 1024 * 1024) {
          setUploadError(`"${file.name}" exceeds the 10MB file limit.`);
          continue;
        }

        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/milestones/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          setUploadError(data.error || `Failed to upload "${file.name}".`);
          continue;
        }

        setAttachments((prev) => [
          ...prev,
          {
            fileName: data.fileName,
            fileUrl: data.fileUrl,
            fileType: data.fileType,
            fileSize: data.fileSize,
            storageProvider: data.storageProvider,
          },
        ]);
      }
    } catch (err) {
      console.error("Upload error:", err);
      setUploadError("An error occurred while uploading. Please try again.");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddLink = () => {
    setLinks((prev) => [...prev, { title: "", url: "" }]);
  };

  const handleLinkChange = (index: number, field: "title" | "url", value: string) => {
    setLinks((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const handleRemoveLink = (index: number) => {
    setLinks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmissionError(null);

    // Filter valid links
    const validLinks = links
      .map((l) => ({
        title: l.title.trim() || undefined,
        url: l.url.trim(),
      }))
      .filter((l) => Boolean(l.url));

    if (!description.trim() || description.trim().length < 10) {
      setSubmissionError(
        "Please provide a meaningful work description of at least 10 characters."
      );
      return;
    }

    if (attachments.length === 0 && validLinks.length === 0) {
      setSubmissionError(
        "Please attach at least one work proof file (image/PDF) or provide a deliverable link."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await submitMilestoneAction({
        milestoneId: milestone.id,
        description: description.trim(),
        attachments,
        links: validLinks,
      });

      if (!res.success) {
        setSubmissionError(res.error || "Failed to submit milestone deliverable.");
        return;
      }

      onSuccess(milestone.id);
      onClose();
    } catch (err) {
      console.error("Submission error:", err);
      setSubmissionError("Network error submitting deliverable. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-850/50">
          <div>
            <h2 className="text-lg font-extrabold text-zinc-950 dark:text-white">
              Submit Milestone Deliverable
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Contract: {contractTitle}
            </p>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="rounded-xl p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Modal Content / Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section 1: Milestone Info Badge */}
          <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 p-4 border border-zinc-200/80 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <span className="font-extrabold text-zinc-900 dark:text-white text-sm block">
                {milestone.title}
              </span>
              {milestone.description && (
                <p className="text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                  {milestone.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {milestone.dueDate && (
                <span className="text-zinc-500">
                  Due {formatDate(milestone.dueDate)}
                </span>
              )}
              <span className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-extrabold px-3 py-1 border border-emerald-200 dark:border-emerald-800">
                ${milestone.amount.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Submission Error Banner */}
          {submissionError && (
            <div className="rounded-2xl bg-rose-50 p-4 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800 text-xs font-semibold text-rose-800 dark:text-rose-300 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>⚠️</span>
                <span>{submissionError}</span>
              </div>
              <button
                type="button"
                onClick={() => setSubmissionError(null)}
                className="text-rose-700 font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* Section 2: Work Completion Description */}
          <div className="space-y-2">
            <label
              htmlFor="deliverableDescription"
              className="block text-xs font-bold text-zinc-900 dark:text-white"
            >
              Describe Your Completed Work <span className="text-rose-500">*</span>
            </label>
            <textarea
              id="deliverableDescription"
              rows={4}
              required
              disabled={isSubmitting}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain what you have completed for this milestone, including the work performed, important changes, and delivered features..."
              className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-3.5 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition leading-relaxed resize-y"
            />
          </div>

          {/* Section 3: Upload Work Proof (Screenshots, PDFs, Documents) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-zinc-900 dark:text-white">
                Upload Screenshots / Work Evidence (PNG, JPG, PDF)
              </label>
              <span className="text-[11px] text-zinc-400">Max 10MB per file</span>
            </div>

            {/* Drag & Drop / File Input Area */}
            <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/20 p-5 cursor-pointer hover:bg-zinc-100/50 dark:hover:bg-zinc-800/40 transition">
              <span className="text-2xl mb-1">📸</span>
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                Click to attach screenshots or PDF deliverables
              </span>
              <span className="text-[10px] text-zinc-400 mt-0.5">
                PNG, JPG, JPEG, WebP, or PDF up to 10MB
              </span>
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
                disabled={isUploading || isSubmitting}
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            {/* Upload Spinner / Error */}
            {isUploading && (
              <div className="flex items-center gap-2 text-xs text-emerald-600 font-semibold p-2">
                <span className="animate-spin">⏳</span>
                <span>Uploading work evidence to secure storage...</span>
              </div>
            )}
            {uploadError && (
              <p className="text-xs text-rose-600 font-semibold">
                ⚠️ {uploadError}
              </p>
            )}

            {/* Attached Files List */}
            {attachments.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {attachments.map((att, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {att.fileType.startsWith("image/") ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={att.fileUrl}
                          alt="preview"
                          className="h-8 w-8 object-cover rounded-lg border border-zinc-200 dark:border-zinc-700 shrink-0"
                        />
                      ) : (
                        <span className="h-8 w-8 flex items-center justify-center rounded-lg bg-red-100 text-red-700 text-xs font-bold shrink-0">
                          PDF
                        </span>
                      )}
                      <div className="truncate">
                        <span className="font-semibold text-zinc-900 dark:text-white truncate block">
                          {att.fileName}
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          {(att.fileSize / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleRemoveAttachment(idx)}
                      className="text-zinc-400 hover:text-rose-500 font-bold px-1.5 transition"
                      title="Remove attachment"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 4: Live Work / Deliverable Links */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-zinc-900 dark:text-white">
                Live Work / Deliverable Links (GitHub, Figma, Live URL)
              </label>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleAddLink}
                className="text-xs font-bold text-emerald-600 hover:underline dark:text-emerald-400"
              >
                + Add Another Link
              </button>
            </div>

            <div className="space-y-2">
              {links.map((link, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    disabled={isSubmitting}
                    placeholder="Title (e.g. GitHub Repository, Live Demo)"
                    value={link.title}
                    onChange={(e) => handleLinkChange(idx, "title", e.target.value)}
                    className="w-1/3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <input
                    type="url"
                    disabled={isSubmitting}
                    placeholder="https://github.com/username/project..."
                    value={link.url}
                    onChange={(e) => handleLinkChange(idx, "url", e.target.value)}
                    className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  {links.length > 1 && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleRemoveLink(idx)}
                      className="text-zinc-400 hover:text-rose-500 font-bold p-1 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isUploading}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow hover:bg-emerald-500 transition disabled:opacity-50 active:scale-95"
            >
              {isSubmitting ? "Submitting..." : "Submit Milestone for Review →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

