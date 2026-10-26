import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { ContractStatus, Prisma } from "@prisma/client";
import {
  ContractsListView,
  ContractListItem,
} from "@/components/contracts/ContractsListView";

export const metadata: Metadata = {
  title: "Contracts | WorkPulse",
  description: "View and manage active client-freelancer contracts and milestone deliverables.",
};

interface ContractsPageProps {
  searchParams: Promise<{
    status?: string;
  }>;
}

async function ContractsContent({ searchParams }: ContractsPageProps) {
  await connection();
  const user = await requireUser("/login");
  const params = await searchParams;
  const statusParam = params.status?.toUpperCase();

  const where: Prisma.ContractWhereInput =
    user.role === "CLIENT" ? { clientId: user.id } : { freelancerId: user.id };

  if (
    statusParam &&
    Object.values(ContractStatus).includes(statusParam as ContractStatus)
  ) {
    where.status = statusParam as ContractStatus;
  }

  const rawContracts = await prisma.contract.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      type: true,
      totalAmount: true,
      hourlyRate: true,
      status: true,
      startDate: true,
      jobId: true,
      client: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      freelancer: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      milestones: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  const contracts: ContractListItem[] = rawContracts.map((c) => {
    const isClient = user.role === "CLIENT";
    const counterparty = isClient ? c.freelancer : c.client;
    const counterpartyName =
      counterparty.name || (counterparty.email ? counterparty.email.split("@")[0] : "User");

    const approvedCount = c.milestones.filter((m) => m.status === "APPROVED").length;

    return {
      id: c.id,
      title: c.title,
      type: c.type,
      totalAmount: c.totalAmount,
      hourlyRate: c.hourlyRate,
      status: c.status,
      startDate: c.startDate.toISOString(),
      counterpartyName,
      counterpartyRole: isClient ? "Freelancer" : "Client",
      jobId: c.jobId,
      milestonesCount: c.milestones.length,
      approvedMilestonesCount: approvedCount,
    };
  });

  return (
    <ContractsListView
      contracts={contracts}
      totalContracts={contracts.length}
      userRole={user.role}
      currentStatus={statusParam || ""}
    />
  );
}

export default function ContractsPage({ searchParams }: ContractsPageProps) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 text-center text-sm text-zinc-500">
          Loading Contracts...
        </div>
      }
    >
      <ContractsContent searchParams={searchParams} />
    </Suspense>
  );
}
