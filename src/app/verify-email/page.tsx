import { Suspense } from "react";
import type { Metadata } from "next";
import { VerifyEmailView } from "@/components/auth/VerifyEmailView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Verify Email | WorkPulse",
  description: "Confirm your email address for your WorkPulse account.",
};

export default function VerifyEmailPage() {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8 bg-zinc-50 dark:bg-zinc-950">
      <Suspense
        fallback={
          <div className="text-sm text-zinc-500 py-12 text-center">
            Loading verification...
          </div>
        }
      >
        <VerifyEmailView />
      </Suspense>
    </div>
  );
}
