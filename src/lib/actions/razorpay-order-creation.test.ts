/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMilestonePaymentOrderAction,
  createTimesheetPaymentOrderAction,
  verifyPaymentSignatureAction,
} from "./payment";
import {
  getRazorpayCredentials,
  getRazorpayPublicConfig,
  handlePaymentGatewayError,
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
} from "@/lib/razorpay";
import { prisma } from "@/lib/prisma";
import { verifyUserForAction, getCurrentUser } from "@/lib/session";
import {
  ContractStatus,
  PaymentType,
  PaymentStatus,
  PaymentItemType,
  MilestoneStatus,
} from "@prisma/client";

// Mock Razorpay SDK
const mockOrdersCreate = vi.fn();
vi.mock("razorpay", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      orders: {
        create: mockOrdersCreate,
      },
    })),
  };
});

vi.mock("@/lib/session", () => ({
  verifyUserForAction: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contract: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    contractMilestone: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn((callback: any) =>
      callback({
        contract: {
          update: vi.fn().mockResolvedValue({ id: "mock_contract_id" }),
        },
        payment: {
          create: vi.fn().mockImplementation(({ data }: any) =>
            Promise.resolve({ id: "pay_rec_123", ...data })
          ),
          update: vi.fn().mockResolvedValue({ id: "pay_rec_123" }),
        },
        contractMilestone: {
          update: vi.fn().mockResolvedValue({ id: "mock_milestone_id", isPaid: true }),
        },
      })
    ),
    $runCommandRaw: vi.fn().mockResolvedValue({ ok: 1 }),
  },
}));

describe("Razorpay Order Creation & Live Lifecycle Management", () => {
  const originalEnv = process.env;
  const clientId = "6afd3065a6ca56dca0444d25";
  const freelancerId = "6adade1afaeade46f3424d44";
  const contractId = "6afd34903f7c53d7d31d290e";
  const milestoneId = "6afd34dff8108284558de868";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      RAZORPAY_TEST_KEY: "rzp_test_mockKey123",
      RAZORPAY_TEST_SECRET: "mockSecretKey456789",
      RAZORPAY_WEBHOOK_SECRET: "mockWebhookSecret123456",
      RAZORPAY_CURRENCY: "USD",
      NODE_ENV: "test",
    };
  });

  describe("1. Environment Credentials & Mode Detection", () => {
    it("correctly identifies test mode credentials", () => {
      process.env.RAZORPAY_TEST_KEY = "rzp_test_abc123456";
      process.env.RAZORPAY_TEST_SECRET = "testSecret987654";
      const creds = getRazorpayCredentials();

      expect(creds.isConfigured).toBe(true);
      expect(creds.isTestMode).toBe(true);
      expect(creds.isLiveMode).toBe(false);
      expect(creds.environment).toBe("TEST");
      expect(creds.currency).toBe("USD");
    });

    it("correctly identifies live mode credentials in production", () => {
      (process.env as any).NODE_ENV = "production";
      process.env.RAZORPAY_KEY_ID = "rzp_live_abc123456";
      process.env.RAZORPAY_KEY_SECRET = "liveSecret987654";
      delete process.env.RAZORPAY_TEST_KEY;
      delete process.env.RAZORPAY_TEST_SECRET;

      const creds = getRazorpayCredentials();
      expect(creds.isConfigured).toBe(true);
      expect(creds.isTestMode).toBe(false);
      expect(creds.isLiveMode).toBe(true);
      expect(creds.environment).toBe("LIVE");
    });

    it("marks unconfigured if credentials are placeholder or missing", () => {
      process.env.RAZORPAY_TEST_KEY = "";
      process.env.RAZORPAY_KEY_ID = "";
      const creds = getRazorpayCredentials();
      expect(creds.isConfigured).toBe(false);
      expect(creds.environment).toBe("UNCONFIGURED");
    });

    it("public config never leaks secret keys or webhooks", () => {
      const pub = getRazorpayPublicConfig();
      expect(pub).toHaveProperty("keyId");
      expect(pub).toHaveProperty("currency");
      expect(pub).not.toHaveProperty("keySecret");
      expect(pub).not.toHaveProperty("webhookSecret");
    });
  });

  describe("2. Milestone Eligibility & Authorization Guards", () => {
    it("fails when unauthenticated caller attempts to pay", async () => {
      (verifyUserForAction as any).mockResolvedValue({
        success: false,
        error: "Authentication required.",
      });

      const res = await createMilestonePaymentOrderAction({
        contractId,
        milestoneId,
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe("Authentication required.");
    });

    it("rejects payment if caller is not the contract client", async () => {
      (verifyUserForAction as any).mockResolvedValue({
        success: true,
        user: { id: "6afd3065a6ca56dca0444999", role: "CLIENT" },
      });
      (prisma.contractMilestone.findUnique as any).mockResolvedValue({
        id: milestoneId,
        contractId,
        status: MilestoneStatus.APPROVED,
        amount: 250,
        isPaid: false,
        contract: {
          id: contractId,
          clientId: clientId, // Different from caller
          freelancerId,
          status: ContractStatus.ACTIVE,
          type: PaymentType.FIXED,
        },
      });

      const res = await createMilestonePaymentOrderAction({
        contractId,
        milestoneId,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Only the contract client can initiate milestone payments/i);
    });

    it("rejects payment if milestone is not in APPROVED status", async () => {
      (verifyUserForAction as any).mockResolvedValue({
        success: true,
        user: { id: clientId, role: "CLIENT" },
      });
      (prisma.contractMilestone.findUnique as any).mockResolvedValue({
        id: milestoneId,
        contractId,
        status: MilestoneStatus.PENDING,
        amount: 250,
        isPaid: false,
        contract: {
          id: contractId,
          clientId,
          freelancerId,
          status: ContractStatus.ACTIVE,
          type: PaymentType.FIXED,
        },
      });

      const res = await createMilestonePaymentOrderAction({
        contractId,
        milestoneId,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Only approved milestone deliverables are eligible for payment/i);
    });

    it("rejects payment if milestone has already been paid", async () => {
      (verifyUserForAction as any).mockResolvedValue({
        success: true,
        user: { id: clientId, role: "CLIENT" },
      });
      (prisma.contractMilestone.findUnique as any).mockResolvedValue({
        id: milestoneId,
        contractId,
        status: MilestoneStatus.APPROVED,
        amount: 250,
        isPaid: true,
        contract: {
          id: contractId,
          clientId,
          freelancerId,
          status: ContractStatus.ACTIVE,
          type: PaymentType.FIXED,
        },
      });

      const res = await createMilestonePaymentOrderAction({
        contractId,
        milestoneId,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/already been paid and settled/i);
    });
  });

  describe("3. Order Creation & Amount Subunit Calculation", () => {
    it("creates order with authoritative $250 converted to 25000 cents", async () => {
      (verifyUserForAction as any).mockResolvedValue({
        success: true,
        user: { id: clientId, role: "CLIENT" },
      });
      (prisma.contractMilestone.findUnique as any).mockResolvedValue({
        id: milestoneId,
        title: "Milestone Deliverable",
        contractId,
        status: MilestoneStatus.APPROVED,
        amount: 250, // $250
        isPaid: false,
        contract: {
          id: contractId,
          title: "Fixed Project",
          clientId,
          freelancerId,
          status: ContractStatus.ACTIVE,
          type: PaymentType.FIXED,
        },
      });
      (prisma.payment.findFirst as any).mockResolvedValue(null);

      mockOrdersCreate.mockResolvedValue({
        id: "order_rzp_live_250",
        amount: 25000,
        currency: "USD",
        status: "created",
      });

      const res = await createMilestonePaymentOrderAction({
        contractId,
        milestoneId,
      });

      expect(res.success).toBe(true);
      expect(res.orderId).toBe("order_rzp_live_250");
      expect(res.amount).toBe(250);
      expect(res.amountSubunits).toBe(25000);
      expect(res.currency).toBe("USD");
      expect(mockOrdersCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 25000,
          currency: "USD",
          notes: expect.objectContaining({
            contractId,
            milestoneId,
            itemType: "MILESTONE",
          }),
        })
      );
    });

    it("re-uses existing pending payment order (idempotency)", async () => {
      (verifyUserForAction as any).mockResolvedValue({
        success: true,
        user: { id: clientId, role: "CLIENT" },
      });
      (prisma.contractMilestone.findUnique as any).mockResolvedValue({
        id: milestoneId,
        title: "Milestone Deliverable",
        contractId,
        status: MilestoneStatus.APPROVED,
        amount: 250,
        isPaid: false,
        contract: {
          id: contractId,
          clientId,
          freelancerId,
          status: ContractStatus.ACTIVE,
          type: PaymentType.FIXED,
        },
      });

      // Existing pending payment
      (prisma.payment.findFirst as any).mockResolvedValue({
        id: "existing_pay_123",
        razorpayOrderId: "order_existing_999",
        amount: 250,
        amountSubunits: 25000,
        currency: "USD",
        status: PaymentStatus.PENDING,
      });

      const res = await createMilestonePaymentOrderAction({
        contractId,
        milestoneId,
      });

      expect(res.success).toBe(true);
      expect(res.orderId).toBe("order_existing_999");
      expect(res.paymentRecordId).toBe("existing_pay_123");
      // Does not call orders.create again
      expect(mockOrdersCreate).not.toHaveBeenCalled();
    });
  });

  describe("4. Error Handling & Safe Technical Logging", () => {
    it("handles 401 authentication failure with specific user message", () => {
      const error = {
        statusCode: 401,
        error: {
          code: "BAD_REQUEST_ERROR",
          description: "Authentication failed. Invalid key or secret.",
        },
      };

      const result = handlePaymentGatewayError(error, {
        operation: "createMilestonePaymentOrder",
        contractId,
        milestoneId,
        amount: 250,
        currency: "USD",
      });

      expect(result.userMessage).toBe(
        "Payment authentication failed. Please check the payment configuration."
      );
    });

    it("handles unsupported currency error cleanly", () => {
      const error = {
        statusCode: 400,
        error: {
          code: "BAD_REQUEST_ERROR",
          description: "Currency not supported for this merchant account",
        },
      };

      const result = handlePaymentGatewayError(error, {
        operation: "createMilestonePaymentOrder",
        contractId,
        milestoneId,
        amount: 250,
        currency: "XYZ",
      });

      expect(result.userMessage).toBe("This payment currency is not currently supported.");
    });

    it("handles P2002 concurrent order creation with polite retry message", () => {
      const error = {
        code: "P2002",
        message: "Unique constraint failed",
      };

      const result = handlePaymentGatewayError(error, {
        operation: "createMilestonePaymentOrder",
        contractId,
        milestoneId,
        amount: 250,
        currency: "USD",
      });

      expect(result.userMessage).toMatch(/currently processing. Please wait a moment/i);
    });
  });

  describe("5. Payment Signature & Settlement Lifecycle", () => {
    it("verifies valid HMAC-SHA256 signature and settles milestone as paid", async () => {
      const secret = "mockSecretKey456789";
      const orderId = "order_settle_123";
      const paymentId = "pay_settle_456";
      const signature = crypto
        .createHmac("sha256", secret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

      (getCurrentUser as any).mockResolvedValue({ id: clientId, role: "CLIENT" });
      (prisma.payment.findUnique as any).mockResolvedValue({
        id: "payment_db_123",
        contractId,
        milestoneId,
        itemType: PaymentItemType.MILESTONE,
        amount: 250,
        currency: "USD",
        status: PaymentStatus.PENDING,
      });

      const res = await verifyPaymentSignatureAction({
        contractId,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      });

      expect(res.success).toBe(true);
      expect(res.paymentId).toBe("payment_db_123");
      expect(res.amount).toBe(250);
      expect(res.currency).toBe("USD");
    });

    it("rejects tampered signature without settling payment", async () => {
      (getCurrentUser as any).mockResolvedValue({ id: clientId, role: "CLIENT" });
      (prisma.payment.findUnique as any).mockResolvedValue({
        id: "payment_db_123",
        contractId,
        milestoneId,
        status: PaymentStatus.PENDING,
      });

      const res = await verifyPaymentSignatureAction({
        contractId,
        razorpayOrderId: "order_settle_123",
        razorpayPaymentId: "pay_settle_456",
        razorpaySignature: "invalid_tampered_signature_hex",
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Invalid gateway signature/i);
    });
  });
});
