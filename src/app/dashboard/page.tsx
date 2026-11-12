import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { Role } from "@/types";

async function DashboardRedirector() {
  await connection();
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login?redirectTo=/dashboard");
  }

  if (!user.roleSelected) {
    redirect("/onboarding/role");
  }

  if (user.role === Role.CLIENT) {
    redirect("/dashboard/client");
  }

  if (user.role === Role.FREELANCER) {
    redirect("/dashboard/freelancer");
  }

  redirect("/dashboard/client");
  return null;
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-zinc-500">
          Redirecting to your dashboard...
        </div>
      }
    >
      <DashboardRedirector />
    </Suspense>
  );
}

