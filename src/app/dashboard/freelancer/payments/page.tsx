import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { Role } from "@prisma/client";
import { getFreelancerPaymentsAction } from "@/lib/actions/payment";
import { FreelancerPaymentsView } from "@/components/dashboard/FreelancerPaymentsView";

export const metadata: Metadata = {
  title: "Earnings & Payments | WorkPulse",
  description:
    "Track client payments, approved milestone earnings, timesheet receipts, and settlement audit logs.",
};

interface PaymentsPageProps {
  searchParams: Promise<{
    status?: string;
    type?: string;
    search?: string;
    page?: string;
  }>;
}

async function PaymentsContent({ searchParams }: PaymentsPageProps) {
  await connection();
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login?redirectTo=/dashboard/freelancer/payments");
  }

  if (user.role === Role.CLIENT) {
    redirect("/dashboard/client");
  }

  if (!user.roleSelected) {
    redirect("/onboarding/role");
  }

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1);

  const result = await getFreelancerPaymentsAction({
    status: params.status,
    type: params.type,
    search: params.search,
    page,
    limit: 10,
  });

  return (
    <FreelancerPaymentsView
      payments={result.payments}
      summary={result.summary}
      totalPayments={result.totalPayments}
      currentPage={result.currentPage}
      totalPages={result.totalPages}
      currentStatus={params.status || ""}
      currentType={params.type || ""}
      searchQuery={params.search || ""}
    />
  );
}

export default function FreelancerPaymentsPage({
  searchParams,
}: PaymentsPageProps) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 text-center text-xs text-zinc-500 animate-pulse">
          Loading verified earnings and payment records...
        </div>
      }
    >
      <PaymentsContent searchParams={searchParams} />
    </Suspense>
  );
}
