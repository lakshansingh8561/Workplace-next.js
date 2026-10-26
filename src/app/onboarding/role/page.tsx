import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { requireUser } from "@/lib/session";
import { RoleOnboardingForm } from "@/components/auth/RoleOnboardingForm";

export const metadata: Metadata = {
  title: "Account Onboarding | WorkPulse",
  description: "Select your role to complete your WorkPulse profile setup.",
};

async function OnboardingRoleContent() {
  await connection();
  const user = await requireUser("/login?redirectTo=/onboarding/role");

  // If role is already selected, bypass onboarding
  if (user.roleSelected) {
    if (user.role === "CLIENT") {
      redirect("/dashboard/client");
    } else {
      redirect("/dashboard/freelancer");
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <RoleOnboardingForm
        userName={user.name}
        userEmail={user.email}
        userImage={user.image}
      />
    </div>
  );
}

export default function OnboardingRolePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[500px]">
          <div className="h-8 w-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <OnboardingRoleContent />
    </Suspense>
  );
}
