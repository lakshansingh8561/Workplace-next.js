"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  ContractStatus,
  PaymentItemType,
  PaymentStatus,
  PaymentType,
  Role,
  Prisma,
  TimesheetReviewStatus,
  TimeTrackingStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  CreateMilestonePaymentOrderSchema,
  CreateTimesheetPaymentOrderSchema,
  VerifyPaymentSignatureSchema,
  CreateMilestonePaymentOrderInput,
  CreateTimesheetPaymentOrderInput,
  VerifyPaymentSignatureInput,
} from "@/lib/validations/payment";
import {
  getRazorpayClient,
  getRazorpayCredentials,
  verifyRazorpaySignature,
} from "@/lib/razorpay";

export type PaymentOrderResult = {
  success: boolean;
  orderId?: string;
  paymentRecordId?: string;
  amount?: number;
  amountSubunits?: number;
  currency?: string;
  keyId?: string;
  title?: string;
  itemType?: PaymentItemType;
  isTestMode?: boolean;
  error?: string;
};

export type VerifyPaymentResult = {
  success: boolean;
  paymentId?: string;
  amount?: number;
  currency?: string;
  paidAt?: string;
  error?: string;
};

export type PaymentRecordDTO = {
  id: string;
  itemType: PaymentItemType;
  amount: number;
  currency: string;
  status: PaymentStatus;
  razorpayOrderId: string;
  razorpayPaymentId?: string | null;
  paidAt?: string | null;
  createdAt: string;
  milestoneTitle?: string | null;
  sessionCount: number;
};

/**
 * Creates a Razorpay Order for an approved, unpaid fixed-price milestone.
 * Enforces:
 * 1. Caller is the contract's authenticated client.
 * 2. Contract is FIXED price and ACTIVE.
 * 3. Milestone is in APPROVED status and is not already paid.
 * 4. Idempotency: reuses pending order if valid, prevents duplicate orders.
 * 5. Amount is strictly calculated from server-side milestone records.
 */
export async function createMilestonePaymentOrderAction(
  input: CreateMilestonePaymentOrderInput
): Promise<PaymentOrderResult> {
  const parseResult = CreateMilestonePaymentOrderSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues[0]?.message || "Invalid milestone payment request.",
    };
  }

  const { contractId, milestoneId } = parseResult.data;
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "Authentication required to initiate payment." };
  }

  try {
    const milestone = await prisma.contractMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        contract: {
          select: {
            id: true,
            title: true,
            clientId: true,
            freelancerId: true,
            status: true,
            type: true,
          },
        },
      },
    });

    if (!milestone || milestone.contractId !== contractId) {
      return { success: false, error: "Milestone deliverable not found." };
    }

    if (milestone.contract.clientId !== user.id) {
      return {
        success: false,
        error: "Unauthorized: Only the contract client can initiate milestone payments.",
      };
    }

    if (milestone.contract.status !== ContractStatus.ACTIVE) {
      return {
        success: false,
        error: `Cannot pay for milestone. Contract is currently ${milestone.contract.status.toLowerCase()}.`,
      };
    }

    if (milestone.status !== "APPROVED") {
      return {
        success: false,
        error: `Only approved milestone deliverables are eligible for payment. Current status: ${milestone.status.toLowerCase()}.`,
      };
    }

    if (milestone.isPaid) {
      return {
        success: false,
        error: "This milestone has already been paid and settled.",
      };
    }

    const { keyId, currency, isConfigured, isTestMode } = getRazorpayCredentials();
    if (!isConfigured) {
      return {
        success: false,
        error: "Razorpay payment gateway is not configured. Please check your credentials in .env.",
      };
    }

    const amount = milestone.amount;
    if (amount <= 0) {
      return { success: false, error: "Milestone payment amount must be greater than zero." };
    }

    const amountSubunits = Math.round(amount * 100);
    const minSubunits = currency === "INR" ? 100 : 50;
    if (amountSubunits < minSubunits) {
      const minDisplay = currency === "INR" ? "₹1.00" : `${currency} ${(minSubunits / 100).toFixed(2)}`;
      return {
        success: false,
        error: `Milestone payment amount (${currency} ${(amountSubunits / 100).toFixed(2)}) is below Razorpay's minimum transaction limit (${minDisplay}).`,
      };
    }

    // Check for existing pending payment record (idempotency check)
    const existingPending = await prisma.payment.findFirst({
      where: {
        contractId: milestone.contract.id,
        milestoneId: milestone.id,
        status: PaymentStatus.PENDING,
      },
      orderBy: { createdAt: "desc" },
    });

    if (existingPending) {
      return {
        success: true,
        orderId: existingPending.razorpayOrderId,
        paymentRecordId: existingPending.id,
        amount: existingPending.amount,
        amountSubunits: existingPending.amountSubunits,
        currency: existingPending.currency,
        keyId,
        title: `Milestone: ${milestone.title}`,
        itemType: PaymentItemType.MILESTONE,
        isTestMode,
      };
    }

    const receipt = `m_${milestone.id.slice(-8)}_${Date.now().toString().slice(-6)}`;

    const rzp = getRazorpayClient();
    const order = await rzp.orders.create({
      amount: amountSubunits,
      currency,
      receipt,
      notes: {
        contractId: milestone.contract.id,
        milestoneId: milestone.id,
        payerId: user.id,
        recipientId: milestone.contract.freelancerId,
        itemType: "MILESTONE",
      },
    });

    const payment = await prisma.payment.create({
      data: {
        contractId: milestone.contract.id,
        payerId: user.id,
        recipientId: milestone.contract.freelancerId,
        itemType: PaymentItemType.MILESTONE,
        milestoneId: milestone.id,
        timeEntryIds: [],
        amount,
        currency,
        amountSubunits,
        razorpayOrderId: order.id,
        status: PaymentStatus.PENDING,
      },
    });

    return {
      success: true,
      orderId: order.id,
      paymentRecordId: payment.id,
      amount,
      amountSubunits,
      currency,
      keyId,
      title: `Milestone: ${milestone.title}`,
      itemType: PaymentItemType.MILESTONE,
      isTestMode,
    };
  } catch (error) {
    console.error(
      "[WorkPulse Create Milestone Payment Order Error]:",
      error instanceof Error ? error.message : "Gateway error"
    );
    return {
      success: false,
      error: "Failed to create Razorpay payment order. Please verify credentials.",
    };
  }
}

/**
 * Creates a Razorpay Order for approved, unpaid hourly timesheet sessions.
 * Enforces:
 * 1. Caller is the contract's authenticated client.
 * 2. Contract is HOURLY and ACTIVE.
 * 3. All selected entries belong to the contract, are STOPPED, APPROVED, and unpaid.
 * 4. Disputed, unsubmitted, or already-paid entries are strictly rejected.
 * 5. Amount is calculated server-side from stored rate and billable duration snapshots.
 */
export async function createTimesheetPaymentOrderAction(
  input: CreateTimesheetPaymentOrderInput
): Promise<PaymentOrderResult> {
  const parseResult = CreateTimesheetPaymentOrderSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues[0]?.message || "Invalid timesheet payment request.",
    };
  }

  const { contractId, timeEntryIds } = parseResult.data;
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "Authentication required to initiate payment." };
  }

  try {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        title: true,
        clientId: true,
        freelancerId: true,
        status: true,
        type: true,
      },
    });

    if (!contract) {
      return { success: false, error: "Contract not found." };
    }

    if (contract.clientId !== user.id) {
      return {
        success: false,
        error: "Unauthorized: Only the contract client can initiate timesheet payments.",
      };
    }

    if (contract.type !== PaymentType.HOURLY) {
      return {
        success: false,
        error: "Timesheet payments are only supported for hourly contracts.",
      };
    }

    if (contract.status !== ContractStatus.ACTIVE) {
      return {
        success: false,
        error: `Cannot pay for timesheet sessions. Contract is currently ${contract.status.toLowerCase()}.`,
      };
    }

    const entries = await prisma.timeEntry.findMany({
      where: {
        id: { in: timeEntryIds },
        contractId: contract.id,
      },
      select: {
        id: true,
        status: true,
        reviewStatus: true,
        billableAmount: true,
        isPaid: true,
      },
    });

    if (entries.length !== timeEntryIds.length) {
      return {
        success: false,
        error: "One or more selected time entries do not exist for this contract.",
      };
    }

    const nonStopped = entries.find((e) => e.status !== TimeTrackingStatus.STOPPED);
    if (nonStopped) {
      return {
        success: false,
        error: "Cannot pay for in-progress or paused time tracking sessions.",
      };
    }

    const notApproved = entries.find((e) => e.reviewStatus !== TimesheetReviewStatus.APPROVED);
    if (notApproved) {
      return {
        success: false,
        error: "Cannot pay for unapproved or disputed sessions. Client must approve sessions before payment.",
      };
    }

    const alreadyPaid = entries.find((e) => e.isPaid);
    if (alreadyPaid) {
      return {
        success: false,
        error: "One or more selected sessions have already been paid.",
      };
    }

    // Strictly calculate total amount from server-side stored snapshots
    const totalAmount = Number(
      entries.reduce((sum, e) => sum + (e.billableAmount || 0), 0).toFixed(2)
    );

    if (totalAmount <= 0) {
      return {
        success: false,
        error: "Total billable amount for selected sessions must be greater than zero.",
      };
    }

    const { keyId, currency, isConfigured, isTestMode } = getRazorpayCredentials();
    if (!isConfigured) {
      return {
        success: false,
        error: "Razorpay payment gateway is not configured. Please check your credentials in .env.",
      };
    }

    const amountSubunits = Math.round(totalAmount * 100);
    const minSubunits = currency === "INR" ? 100 : 50;
    if (amountSubunits < minSubunits) {
      const minDisplay = currency === "INR" ? "₹1.00" : `${currency} ${(minSubunits / 100).toFixed(2)}`;
      return {
        success: false,
        error: `Total payment amount (${currency} ${(amountSubunits / 100).toFixed(2)}) is below Razorpay's minimum transaction limit (${minDisplay}). Please approve or include additional work sessions to meet the minimum payment threshold.`,
      };
    }

    const receipt = `ts_${contract.id.slice(-6)}_${Date.now().toString().slice(-6)}`;

    const rzp = getRazorpayClient();
    const order = await rzp.orders.create({
      amount: amountSubunits,
      currency,
      receipt,
      notes: {
        contractId: contract.id,
        payerId: user.id,
        recipientId: contract.freelancerId,
        sessionCount: entries.length.toString(),
        itemType: "HOURLY_TIMESHEET",
      },
    });

    const payment = await prisma.payment.create({
      data: {
        contractId: contract.id,
        payerId: user.id,
        recipientId: contract.freelancerId,
        itemType: PaymentItemType.HOURLY_TIMESHEET,
        milestoneId: null,
        timeEntryIds,
        amount: totalAmount,
        currency,
        amountSubunits,
        razorpayOrderId: order.id,
        status: PaymentStatus.PENDING,
      },
    });

    return {
      success: true,
      orderId: order.id,
      paymentRecordId: payment.id,
      amount: totalAmount,
      amountSubunits,
      currency,
      keyId,
      title: `${entries.length} Approved Work Sessions`,
      itemType: PaymentItemType.HOURLY_TIMESHEET,
      isTestMode,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Gateway error";
    console.error(
      "[WorkPulse Create Timesheet Payment Order Error]:",
      errorMsg
    );
    return {
      success: false,
      error: `Failed to create Razorpay timesheet payment order: ${errorMsg}`,
    };
  }
}

/**
 * Verifies Razorpay Checkout signature on the server and settles the payment.
 * Enforces:
 * 1. HMAC-SHA256 signature verification with server-side secret.
 * 2. Idempotency: repeated confirmations return success without duplicate crediting.
 * 3. Updates local database records (Milestone or TimeEntries marked isPaid: true).
 */
export async function verifyPaymentSignatureAction(
  input: VerifyPaymentSignatureInput
): Promise<VerifyPaymentResult> {
  const parseResult = VerifyPaymentSignatureSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues[0]?.message || "Invalid payment verification data.",
    };
  }

  const { contractId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = parseResult.data;
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "Authentication required to verify payment." };
  }

  try {
    const isValidSignature = verifyRazorpaySignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    const payment = await prisma.payment.findUnique({
      where: { razorpayOrderId },
    });

    if (!payment || (contractId && payment.contractId !== contractId)) {
      return { success: false, error: "Payment order record not found." };
    }

    if (!isValidSignature) {
      // Record failed verification in audit trail
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          failureReason: "HMAC signature mismatch: Potential tampering detected.",
          razorpayPaymentId,
          razorpaySignature,
        },
      });

      return {
        success: false,
        error: "Payment verification failed. Invalid gateway signature.",
      };
    }

    // Idempotency: If already confirmed as SUCCESS, return immediately
    if (payment.status === PaymentStatus.SUCCESS) {
      return {
        success: true,
        paymentId: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        paidAt: payment.paidAt?.toISOString() || new Date().toISOString(),
      };
    }

    const now = new Date();

    // Settle payment and update billable items
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.SUCCESS,
          razorpayPaymentId,
          razorpaySignature,
          paidAt: now,
          failureReason: null,
        },
      });

      if (payment.itemType === PaymentItemType.MILESTONE && payment.milestoneId) {
        await tx.contractMilestone.update({
          where: { id: payment.milestoneId },
          data: {
            isPaid: true,
            paidAt: now,
          },
        });
      } else if (
        payment.itemType === PaymentItemType.HOURLY_TIMESHEET &&
        payment.timeEntryIds.length > 0
      ) {
        await tx.timeEntry.updateMany({
          where: {
            id: { in: payment.timeEntryIds },
          },
          data: {
            isPaid: true,
            paidAt: now,
          },
        });
      }
    });

    revalidatePath(`/contracts/${contractId}`);
    revalidatePath("/dashboard/client");
    revalidatePath("/dashboard/freelancer");

    return {
      success: true,
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      paidAt: now.toISOString(),
    };
  } catch (error) {
    console.error(
      "[WorkPulse Verify Payment Signature Error]:",
      error instanceof Error ? error.message : "Verification error"
    );
    return {
      success: false,
      error: "An error occurred while confirming payment status.",
    };
  }
}

/**
 * Retrieves payment history records for a contract.
 * Strictly verifies contract membership (client or freelancer).
 */
export async function getContractPaymentHistoryAction(contractId: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Authentication required.", payments: [] };
  }

  try {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { clientId: true, freelancerId: true },
    });

    if (!contract || (contract.clientId !== user.id && contract.freelancerId !== user.id)) {
      return { success: false, error: "Unauthorized.", payments: [] };
    }

    const payments = await prisma.payment.findMany({
      where: { contractId },
      orderBy: { createdAt: "desc" },
      include: {
        milestone: {
          select: { id: true, title: true },
        },
      },
    });

    return {
      success: true,
      payments: payments.map((p) => ({
        id: p.id,
        itemType: p.itemType,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        razorpayOrderId: p.razorpayOrderId,
        razorpayPaymentId: p.razorpayPaymentId,
        paidAt: p.paidAt?.toISOString() || null,
        createdAt: p.createdAt.toISOString(),
        milestoneTitle: p.milestone?.title || null,
        sessionCount: p.timeEntryIds.length,
      })),
    };
  } catch (error) {
    console.error("[WorkPulse Get Payment History Error]:", error);
    return { success: false, error: "Failed to load payment history.", payments: [] };
  }
}

export interface FreelancerPaymentItemDTO {
  id: string;
  contractId: string;
  contractTitle: string;
  contractType: PaymentType;
  clientId: string;
  clientName: string;
  clientEmail: string;
  clientImage?: string | null;
  itemType: PaymentItemType;
  milestoneTitle?: string | null;
  sessionCount: number;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paidAt?: string | null;
  createdAt: string;
  razorpayOrderId: string;
  razorpayPaymentId?: string | null;
  failureReason?: string | null;
}

export interface FreelancerPaymentsSummary {
  totalEarnings: number;
  pendingAmount: number;
  settledCount: number;
  pendingCount: number;
  failedCount: number;
  totalTransactions: number;
  currency: string;
}

export interface GetFreelancerPaymentsInput {
  status?: string;
  type?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface GetFreelancerPaymentsResult {
  success: boolean;
  error?: string;
  payments: FreelancerPaymentItemDTO[];
  summary: FreelancerPaymentsSummary;
  totalPayments: number;
  currentPage: number;
  totalPages: number;
}

const emptyFreelancerPaymentsSummary: FreelancerPaymentsSummary = {
  totalEarnings: 0,
  pendingAmount: 0,
  settledCount: 0,
  pendingCount: 0,
  failedCount: 0,
  totalTransactions: 0,
  currency: "USD",
};

/**
 * Retrieves paginated client payment records for the authenticated freelancer.
 * Enforces:
 * 1. Derives identity strictly from server-side session.
 * 2. Restricts access to FREELANCER role.
 * 3. Scopes database queries to recipientId = user.id and contract.freelancerId = user.id.
 * 4. Strictly separates settled earnings (SUCCESS) from pending or failed payments.
 */
export async function getFreelancerPaymentsAction(
  input: GetFreelancerPaymentsInput = {}
): Promise<GetFreelancerPaymentsResult> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      success: false,
      error: "Authentication required to view earnings and payments.",
      payments: [],
      summary: emptyFreelancerPaymentsSummary,
      totalPayments: 0,
      currentPage: 1,
      totalPages: 1,
    };
  }

  if (user.role !== Role.FREELANCER && (user.role as string) !== "FREELANCER") {
    return {
      success: false,
      error: "Unauthorized: Only freelancers can access the earnings dashboard.",
      payments: [],
      summary: emptyFreelancerPaymentsSummary,
      totalPayments: 0,
      currentPage: 1,
      totalPages: 1,
    };
  }

  const { status, type, search, page = 1, limit = 10 } = input;
  const skip = Math.max(0, (page - 1) * limit);

  // Strictly filter by recipientId = user.id AND contract.freelancerId = user.id
  const baseWhere: Prisma.PaymentWhereInput = {
    recipientId: user.id,
    contract: {
      freelancerId: user.id,
    },
  };

  const where: Prisma.PaymentWhereInput = { ...baseWhere };

  if (status && status !== "ALL") {
    const s = status.toUpperCase();
    if (Object.values(PaymentStatus).includes(s as PaymentStatus)) {
      where.status = s as PaymentStatus;
    }
  }

  if (type && type !== "ALL") {
    const t = type.toUpperCase();
    if (Object.values(PaymentItemType).includes(t as PaymentItemType)) {
      where.itemType = t as PaymentItemType;
    }
  }

  if (search && search.trim()) {
    const term = search.trim();
    where.OR = [
      { contract: { title: { contains: term, mode: "insensitive" } } },
      { payer: { name: { contains: term, mode: "insensitive" } } },
      { razorpayOrderId: { contains: term, mode: "insensitive" } },
    ];
  }

  try {
    // 1. Fetch all records for the freelancer to compute summary stats
    const allFreelancerPayments = await prisma.payment.findMany({
      where: baseWhere,
      select: {
        amount: true,
        currency: true,
        status: true,
      },
    });

    let totalEarnings = 0;
    let pendingAmount = 0;
    let settledCount = 0;
    let pendingCount = 0;
    let failedCount = 0;

    for (const p of allFreelancerPayments) {
      if (p.status === PaymentStatus.SUCCESS) {
        totalEarnings += p.amount;
        settledCount++;
      } else if (p.status === PaymentStatus.PENDING) {
        pendingAmount += p.amount;
        pendingCount++;
      } else if (p.status === PaymentStatus.FAILED) {
        failedCount++;
      }
    }

    const summary: FreelancerPaymentsSummary = {
      totalEarnings: Number(totalEarnings.toFixed(2)),
      pendingAmount: Number(pendingAmount.toFixed(2)),
      settledCount,
      pendingCount,
      failedCount,
      totalTransactions: allFreelancerPayments.length,
      currency: "USD",
    };

    // 2. Fetch paginated records matching the active filter
    const [totalMatching, records] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          contract: {
            select: {
              id: true,
              title: true,
              type: true,
            },
          },
          payer: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          milestone: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      }),
    ]);

    const payments: FreelancerPaymentItemDTO[] = records.map((p) => ({
      id: p.id,
      contractId: p.contractId,
      contractTitle: p.contract?.title || "Contract Deliverable",
      contractType: p.contract?.type || PaymentType.FIXED,
      clientId: p.payerId,
      clientName: p.payer?.name || "Client",
      clientEmail: p.payer?.email || "",
      clientImage: p.payer?.image || null,
      itemType: p.itemType,
      milestoneTitle: p.milestone?.title || null,
      sessionCount: p.timeEntryIds?.length || 0,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      paidAt: p.paidAt?.toISOString() || null,
      createdAt: p.createdAt.toISOString(),
      razorpayOrderId: p.razorpayOrderId,
      razorpayPaymentId: p.razorpayPaymentId || null,
      failureReason: p.failureReason || null,
    }));

    return {
      success: true,
      payments,
      summary,
      totalPayments: totalMatching,
      currentPage: page,
      totalPages: Math.ceil(totalMatching / limit) || 1,
    };
  } catch (error) {
    console.error("[WorkPulse Get Freelancer Payments Error]:", error);
    return {
      success: false,
      error: "Failed to load payments and earnings records.",
      payments: [],
      summary: emptyFreelancerPaymentsSummary,
      totalPayments: 0,
      currentPage: 1,
      totalPages: 1,
    };
  }
}

