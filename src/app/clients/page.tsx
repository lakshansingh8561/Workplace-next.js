import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { searchClientsAction } from "@/lib/actions/client-discovery";
import { ClientDiscoveryView } from "@/components/discovery/ClientDiscoveryView";

export const metadata: Metadata = {
  title: "Explore Clients & Companies | WorkPulse Marketplace",
  description:
    "Discover verified clients and hiring companies on WorkPulse. Browse active job openings, company profiles, and collaborate on high-value freelance projects.",
};

interface ClientsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

async function ClientsContent({ searchParams }: ClientsPageProps) {
  await connection();
  const resolved = await searchParams;

  const query = typeof resolved.query === "string" ? resolved.query : undefined;
  const industry = typeof resolved.industry === "string" ? resolved.industry : undefined;
  const location = typeof resolved.location === "string" ? resolved.location : undefined;
  const sort =
    resolved.sort === "name_asc" || resolved.sort === "recent" || resolved.sort === "jobs_desc"
      ? resolved.sort
      : "jobs_desc";
  const page = typeof resolved.page === "string" ? parseInt(resolved.page, 10) : 1;

  const initialData = await searchClientsAction({
    query,
    industry,
    location,
    sort,
    page: isNaN(page) ? 1 : page,
    limit: 12,
  });

  return <ClientDiscoveryView initialData={initialData} />;
}

export default function ClientsPage({ searchParams }: ClientsPageProps) {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-16">
      <Suspense
        fallback={
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            <p className="mt-3 text-xs text-zinc-500 font-medium">Loading clients directory...</p>
          </div>
        }
      >
        <ClientsContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

