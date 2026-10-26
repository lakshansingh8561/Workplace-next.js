import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";

interface FreelancerDashboardPageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

async function FreelancerDashboardRedirect({
  searchParams,
}: FreelancerDashboardPageProps) {
  await connection();
  const params = await searchParams;
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val) query.set(key, val);
  });
  const queryString = query.toString();
  redirect(`/dashboard/freelancer/proposals${queryString ? `?${queryString}` : ""}`);
  return null;
}

export default function FreelancerDashboardPage({
  searchParams,
}: FreelancerDashboardPageProps) {
  return (
    <Suspense fallback={null}>
      <FreelancerDashboardRedirect searchParams={searchParams} />
    </Suspense>
  );
}

