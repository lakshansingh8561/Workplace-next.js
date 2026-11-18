"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { useAppDispatch } from "@/lib/store";
import { updateUserProfile } from "@/lib/store/slices/authSlice";
import { removeProfilePhotoAction } from "@/lib/actions/profile";

interface ProfilePhotoUploadProps {
  initialImage?: string | null;
  userName?: string | null;
  userRole: "CLIENT" | "FREELANCER";
  userId: string;
  onImageUpdated?: (imageUrl: string | null) => void;
}

export function ProfilePhotoUpload({
  initialImage,
  userName,
  userRole,
  userId,
  onImageUpdated,
}: ProfilePhotoUploadProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentImage, setCurrentImage] = useState<string | null>(
    initialImage || null
  );
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset feedback
    setErrorMessage(null);
    setSuccessMessage(null);

    // Validate client-side
    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setErrorMessage("Please select a valid image file (PNG, JPG, or WebP).");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage("Image file exceeds the 5MB size limit.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/profile/upload-image", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to upload profile photo.");
      }

      const newImageUrl = data.imageUrl as string;
      setCurrentImage(newImageUrl);

      // Reactively sync Redux auth state so Navbar and all pages update immediately
      dispatch(updateUserProfile({ image: newImageUrl }));

      onImageUpdated?.(newImageUrl);
      setSuccessMessage("Profile photo updated successfully!");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to upload image.";
      setErrorMessage(msg);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsRemoving(true);

    try {
      const result = await removeProfilePhotoAction();
      if (!result.success) {
        throw new Error(result.error || "Failed to remove profile photo.");
      }

      setCurrentImage(null);

      // Reactively sync Redux auth state
      dispatch(updateUserProfile({ image: null }));

      onImageUpdated?.(null);
      setSuccessMessage("Profile photo removed. Reverted to default avatar.");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to remove image.";
      setErrorMessage(msg);
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
      <h3 className="text-sm font-bold text-zinc-900 dark:text-white pb-2 border-b border-zinc-100 dark:border-zinc-800">
        Profile Photo & Avatar
      </h3>

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-5">
        {/* Live Avatar Preview */}
        <div className="relative shrink-0">
          <Avatar
            src={currentImage}
            name={userName}
            role={userRole}
            userId={userId}
            size="xl"
            className="ring-4 ring-emerald-500/10 dark:ring-emerald-400/20"
          />
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-black/50 text-white">
              <svg
                className="animate-spin h-6 w-6"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Action Controls & Guidelines */}
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/png,image/jpeg,image/jpg,image/webp"
              className="hidden"
              aria-label="Upload profile image"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isRemoving}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 transition"
            >
              {isUploading ? (
                <>
                  <svg
                    className="animate-spin h-3.5 w-3.5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  Uploading...
                </>
              ) : currentImage ? (
                "Change Photo"
              ) : (
                "Upload Photo"
              )}
            </button>

            {currentImage && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={isUploading || isRemoving}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-zinc-700 dark:text-rose-400 dark:hover:bg-rose-950/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50 transition"
              >
                {isRemoving ? "Removing..." : "Remove Photo"}
              </button>
            )}
          </div>

          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            JPG, PNG or WebP. Max file size: 5MB. Square aspect ratio recommended.
            Your photo is synchronized across all jobs, proposals, messages, and contracts.
          </p>

          {errorMessage && (
            <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
              ⚠️ {errorMessage}
            </p>
          )}

          {successMessage && (
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              ✓ {successMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

