import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isValidObjectId } from "@/lib/jobs";
import {
  ContractDetailsView,
  ContractDetail,
} from "@/components/contracts/ContractDetailsView";
import { getContractReviewsData } from "@/lib/actions/review";
import Link from "next/link";

interface ContractDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export async function generateMetadata({
  params,
}: ContractDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Contract Details | WorkPulse`,
    description: `Manage deliverables and milestones for contract ${id}`,
  };
}

async function ContractDetailContent({ params }: ContractDetailPageProps) {
  await connection();
  const user = await requireUser("/login");
  const { id } = await params;

  if (!id || !isValidObjectId(id)) {
    notFound();
  }

  const rawContract = await prisma.contract.findUnique({
    where: { id },
    select: {
      id: true,
      jobId: true,
      title: true,
      type: true,
      totalAmount: true,
      hourlyRate: true,
      terms: true,
      status: true,
      startDate: true,
      endDate: true,
      clientId: true,
      freelancerId: true,
      client: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true,
        },
      },
      freelancer: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true,
        },
      },
      milestones: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          amount: true,
          dueDate: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });

  if (!rawContract) {
    notFound();
  }

  // Strictly verify contract membership: user must be either client or freelancer on this contract
  const isMember =
    rawContract.clientId === user.id || rawContract.freelancerId === user.id;

  if (!isMember) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="rounded-3xl border border-zinc-200 bg-white p-10 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
            🔒
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
            Access Restricted
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            You are not a participant in this contract agreement and cannot view its terms or milestone deliverables.
          </p>
          <div className="mt-6">
            <Link
              href="/contracts"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              ← Back to My Contracts
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const contract: ContractDetail = {
    id: rawContract.id,
    jobId: rawContract.jobId,
    title: rawContract.title,
    type: rawContract.type,
    totalAmount: rawContract.totalAmount,
    hourlyRate: rawContract.hourlyRate,
    terms: rawContract.terms,
    status: rawContract.status,
    startDate: rawContract.startDate.toISOString(),
    endDate: rawContract.endDate?.toISOString() || null,
    clientId: rawContract.clientId,
    freelancerId: rawContract.freelancerId,
    client: rawContract.client,
    freelancer: rawContract.freelancer,
    milestones: rawContract.milestones.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      amount: m.amount,
      dueDate: m.dueDate?.toISOString() || null,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
    })),
  };

  const reviewData = await getContractReviewsData(rawContract.id, user.id);

  return (
    <ContractDetailsView
      contract={contract}
      currentUserId={user.id}
      currentUserRole={user.role}
      reviewData={reviewData}
    />
  );
}

export default function ContractDetailPage({ params }: ContractDetailPageProps) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16 text-center text-sm text-zinc-500">
          Loading Contract Details...
        </div>
      }
    >
      <ContractDetailContent params={params} />
    </Suspense>
  );
}
