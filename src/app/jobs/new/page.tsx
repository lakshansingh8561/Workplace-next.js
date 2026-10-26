import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { PostJobForm } from "@/components/jobs/PostJobForm";

export const metadata: Metadata = {
  title: "Post a Freelance Job | WorkPulse Marketplace",
  description: "Create and publish a new contract requirement to hire top independent talent.",
};

async function NewJobContent() {
  await connection();
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login?redirectTo=/jobs/new");
  }

  if (user.role !== "CLIENT") {
    redirect("/jobs?error=unauthorized_client_only");
  }

  return <PostJobForm userName={user.name || user.email} />;
}

export default function NewJobPage() {
  return (
    <div className="flex-1 px-4 py-8 sm:py-12 sm:px-6 lg:px-8 bg-zinc-50 dark:bg-zinc-950">
      <Suspense
        fallback={
          <div className="mx-auto max-w-3xl py-16 text-center text-sm text-zinc-500">
            Loading job publisher...
          </div>
        }
      >
        <NewJobContent />
      </Suspense>
    </div>
  );
}
