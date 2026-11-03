import { Suspense } from "react";
import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Forgot Password | WorkPulse",
  description: "Recover and reset your WorkPulse account password.",
};

export default function ForgotPasswordPage() {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8 bg-zinc-50 dark:bg-zinc-950">
      <Suspense
        fallback={
          <div className="text-sm text-zinc-500 py-12 text-center">
            Loading...
          </div>
        }
      >
        <ForgotPasswordForm />
      </Suspense>
    </div>
  );
}
