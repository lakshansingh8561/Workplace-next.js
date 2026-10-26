"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { selectRoleAction } from "@/lib/actions/auth";

interface RoleOnboardingFormProps {
  userName?: string | null;
  userEmail?: string | null;
  userImage?: string | null;
}

export function RoleOnboardingForm({
  userName,
  userEmail,
  userImage,
}: RoleOnboardingFormProps) {
  const router = useRouter();
  const [role, setRole] = useState<"CLIENT" | "FREELANCER">("CLIENT");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleConfirmRole = () => {
    setError(null);
    startTransition(async () => {
      const res = await selectRoleAction({ role });
      if (!res.success) {
        setError(res.error || "Failed to update role. Please try again.");
      } else {
        const dest = res.role === "CLIENT" ? "/dashboard/client" : "/dashboard/freelancer";
        router.push(dest);
        router.refresh();
      }
    });
  };

  return (
    <div className="w-full max-w-lg mx-auto">
      <div className="rounded-3xl border border-zinc-200/90 bg-white p-8 sm:p-10 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900/90">
        {/* User Identity Header */}
        <div className="text-center mb-8">
          {userImage ? (
            <Image
              src={userImage}
              alt={userName || "Profile"}
              width={64}
              height={64}
              unoptimized
              className="mx-auto h-16 w-16 rounded-full border-2 border-emerald-500 shadow-md mb-3 object-cover"
            />
          ) : (
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-extrabold text-xl mb-3 shadow-xs">
              {userName ? userName.charAt(0).toUpperCase() : "W"}
            </div>
          )}

          <h1 className="text-2xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
            Welcome to WorkPulse{userName ? `, ${userName}` : ""}!
          </h1>
          <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            Signed in as <span className="font-semibold text-zinc-800 dark:text-zinc-200">{userEmail}</span>
          </p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300 font-medium">
            Please choose how you plan to use the platform. This establishes your permanent workspace.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl bg-red-50 p-3.5 text-xs font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900/50"
          >
            {error}
          </div>
        )}

        {/* Role Cards */}
        <div className="space-y-4 mb-8">
          {/* Client Choice */}
          <div
            onClick={() => setRole("CLIENT")}
            className={`cursor-pointer rounded-2xl border p-5 transition-all flex items-start gap-4 ${
              role === "CLIENT"
                ? "border-emerald-600 bg-emerald-50/50 dark:border-emerald-500 dark:bg-emerald-950/20 ring-2 ring-emerald-500/20"
                : "border-zinc-200 bg-zinc-50/40 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-800/30"
            }`}
          >
            <div
              className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-lg ${
                role === "CLIENT"
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              💼
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  I&apos;m a Client (Hiring)
                </h3>
                {role === "CLIENT" && (
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                    ✓
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                Post jobs, review applicant proposals, manage milestones, and collaborate directly with top freelancers.
              </p>
            </div>
          </div>

          {/* Freelancer Choice */}
          <div
            onClick={() => setRole("FREELANCER")}
            className={`cursor-pointer rounded-2xl border p-5 transition-all flex items-start gap-4 ${
              role === "FREELANCER"
                ? "border-emerald-600 bg-emerald-50/50 dark:border-emerald-500 dark:bg-emerald-950/20 ring-2 ring-emerald-500/20"
                : "border-zinc-200 bg-zinc-50/40 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-800/30"
            }`}
          >
            <div
              className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-lg ${
                role === "FREELANCER"
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              💻
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  I&apos;m a Freelancer (Looking for work)
                </h3>
                {role === "FREELANCER" && (
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                    ✓
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                Discover contracts matching your skills, submit competitive proposals, track milestones, and get paid securely.
              </p>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={handleConfirmRole}
          disabled={isPending}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white shadow-md hover:bg-emerald-500 disabled:opacity-60 transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          {isPending ? (
            <>
              <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Finalizing Profile...</span>
            </>
          ) : (
            <>
              <span>Continue to Workspace</span>
              <span>→</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
