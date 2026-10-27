/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import {
  createMilestonePaymentOrderAction,
  createTimesheetPaymentOrderAction,
  verifyPaymentSignatureAction,
} from "./payment";
import { POST as webhookHandler } from "@/app/api/webhooks/razorpay/route";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
  getRazorpayPublicConfig,
} from "@/lib/razorpay";
import {
  ContractStatus,
  PaymentType,
  PaymentStatus,
  PaymentItemType,
  MilestoneStatus,
  TimeTrackingStatus,
  TimesheetReviewStatus,
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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contract: {
      findUnique: vi.fn(),
    },
    contractMilestone: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    timeEntry: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    payment: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      return cb(prisma);
    }),
  },
}));

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("WorkPulse Razorpay Payment Gateway Integration", () => {
  const clientId = "507f1f77bcf86cd799439011";
  const freelancerId = "507f1f77bcf86cd799439012";
  const contractId = "507f1f77bcf86cd799439013";
  const milestoneId = "507f1f77bcf86cd799439014";
  const timeEntryId1 = "507f1f77bcf86cd799439015";
  const timeEntryId2 = "507f1f77bcf86cd799439016";

  const testKeySecret = "test_razorpay_secret_12345";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RAZORPAY_TEST_KEY = "rzp_test_mockKey123";
    process.env.RAZORPAY_TEST_SECRET = testKeySecret;
    process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test_secret_999";
    process.env.RAZORPAY_CURRENCY = "INR";
  });

  describe("Security: Protecting Razorpay Secrets from Client-Side Code", () => {
    it("getRazorpayPublicConfig returns safe public attributes and never secrets", () => {
      const publicConfig = getRazorpayPublicConfig();
      expect(publicConfig.keyId).toBe("rzp_test_mockKey123");
      expect(publicConfig.isTestMode).toBe(true);
      expect(publicConfig.currency).toBe("INR");
      expect((publicConfig as any).keySecret).toBeUndefined();
      expect((publicConfig as any).secret).toBeUndefined();
      expect((publicConfig as any).webhookSecret).toBeUndefined();
    });
  });

  describe("Cryptographic Signature Verification", () => {
    it("verifies checkout signature correctly with HMAC-SHA256", () => {
      const orderId = "order_O123456789";
      const paymentId = "pay_P987654321";
      const expectedPayload = `${orderId}|${paymentId}`;
      const validSignature = crypto
        .createHmac("sha256", testKeySecret)
        .update(expectedPayload)
        .digest("hex");

      const isValid = verifyRazorpaySignature({
        orderId,
        paymentId,
        signature: validSignature,
        secret: testKeySecret,
      });

      expect(isValid).toBe(true);
    });

    it("rejects invalid or tampered checkout signatures", () => {
      const orderId = "order_O123456789";
      const paymentId = "pay_P987654321";
      const invalidSignature = "tampered_signature_hex_value";

      const isValid = verifyRazorpaySignature({
        orderId,
        paymentId,
        signature: invalidSignature,
        secret: testKeySecret,
      });

      expect(isValid).toBe(false);
    });

    it("verifies webhook signature with exact raw request body", () => {
      const webhookSecret = "whsec_test_secret_999";
      const rawBody = JSON.stringify({
        entity: "event",
        event: "payment.captured",
        payload: { payment: { entity: { id: "pay_1" } } },
      });
      const validWebhookSig = crypto
        .createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");

      const isValid = verifyRazorpayWebhookSignature({
        rawBody,
        signature: validWebhookSig,
        webhookSecret,
      });

      expect(isValid).toBe(true);
    });

    it("rejects invalid webhook signatures", () => {
      const isValid = verifyRazorpayWebhookSignature({
        rawBody: '{"event":"payment.captured"}',
        signature: "invalid_sig_abc",
        webhookSecret: "whsec_test_secret_999",
      });

      expect(isValid).toBe(false);
    });
  });

  describe("Milestone Payment Order Creation", () => {
    it("fails if user is not authenticated", async () => {
      (getCurrentUser as any).mockResolvedValue(null);

      const res = await createMilestonePaymentOrderAction({
        contractId,
        milestoneId,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Authentication required/i);
    });

    it("fails if user is not the client on the contract", async () => {
      (getCurrentUser as any).mockResolvedValue({ id: freelancerId, role: "FREELANCER" });
      (prisma.contractMilestone.findUnique as any).mockResolvedValue({
        id: milestoneId,
        contractId,
        status: MilestoneStatus.APPROVED,
        amount: 250,
        isPaid: false,
        contract: {
          id: contractId,
          title: "Fixed Web Project",
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
      expect(res.error).toMatch(/Only the contract client/i);
    });

    it("fails if milestone is not in APPROVED status", async () => {
      (getCurrentUser as any).mockResolvedValue({ id: clientId, role: "CLIENT" });
      (prisma.contractMilestone.findUnique as any).mockResolvedValue({
        id: milestoneId,
        contractId,
        status: MilestoneStatus.SUBMITTED, // In review, not approved
        amount: 250,
        isPaid: false,
        contract: {
          id: contractId,
          title: "Fixed Web Project",
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
      expect(res.error).toMatch(/Only approved milestone deliverables/i);
    });

    it("fails if milestone is already paid", async () => {
      (getCurrentUser as any).mockResolvedValue({ id: clientId, role: "CLIENT" });
      (prisma.contractMilestone.findUnique as any).mockResolvedValue({
        id: milestoneId,
        contractId,
        status: MilestoneStatus.APPROVED,
        amount: 250,
        isPaid: true, // Already paid!
        contract: {
          id: contractId,
          title: "Fixed Web Project",
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
      expect(res.error).toMatch(/This milestone has already been paid/i);
    });

    it("creates Razorpay order with server-calculated subunits and returns keyId", async () => {
      (getCurrentUser as any).mockResolvedValue({ id: clientId, role: "CLIENT" });
      (prisma.contractMilestone.findUnique as any).mockResolvedValue({
        id: milestoneId,
        title: "Milestone 1",
        contractId,
        status: MilestoneStatus.APPROVED,
        amount: 350.5,
        isPaid: false,
        contract: {
          id: contractId,
          title: "Fixed Web Project",
          clientId,
          freelancerId,
          status: ContractStatus.ACTIVE,
          type: PaymentType.FIXED,
        },
      });
      (prisma.payment.findFirst as any).mockResolvedValue(null);

      mockOrdersCreate.mockResolvedValue({
        id: "order_mock123",
        amount: 35050,
        currency: "INR",
        status: "created",
      });

      (prisma.payment.create as any).mockResolvedValue({
        id: "payrec_1",
        razorpayOrderId: "order_mock123",
      });

      const res = await createMilestonePaymentOrderAction({
        contractId,
        milestoneId,
      });

      expect(res.success).toBe(true);
      expect(res.orderId).toBe("order_mock123");
      expect(res.amountSubunits).toBe(35050); // 350.50 * 100
      expect(res.keyId).toBe("rzp_test_mockKey123");
      expect(res.isTestMode).toBe(true);

      // Verify Razorpay order payload
      expect(mockOrdersCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 35050,
          currency: "INR",
        })
      );
    });
  });

  describe("Hourly Timesheet Payment Order Creation", () => {
    it("fails if contract is not HOURLY", async () => {
      (getCurrentUser as any).mockResolvedValue({ id: clientId, role: "CLIENT" });
      (prisma.contract.findUnique as any).mockResolvedValue({
        id: contractId,
        type: PaymentType.FIXED, // Not hourly
        status: ContractStatus.ACTIVE,
        clientId,
        freelancerId,
      });

      const res = await createTimesheetPaymentOrderAction({
        contractId,
        timeEntryIds: [timeEntryId1],
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Timesheet payments are only supported for hourly contracts/i);
    });

    it("rejects unpaid entries that are not STOPPED or not APPROVED", async () => {
      (getCurrentUser as any).mockResolvedValue({ id: clientId, role: "CLIENT" });
      (prisma.contract.findUnique as any).mockResolvedValue({
        id: contractId,
        type: PaymentType.HOURLY,
        status: ContractStatus.ACTIVE,
        clientId,
        freelancerId,
      });
      (prisma.timeEntry.findMany as any).mockResolvedValue([
        {
          id: timeEntryId1,
          contractId,
          status: TimeTrackingStatus.STOPPED,
          reviewStatus: TimesheetReviewStatus.SUBMITTED, // Not approved!
          isPaid: false,
          billableAmount: 100,
        },
      ]);

      const res = await createTimesheetPaymentOrderAction({
        contractId,
        timeEntryIds: [timeEntryId1],
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Client must approve sessions before payment/i);
    });

    it("calculates exact server total from approved stopped entries and creates order", async () => {
      (getCurrentUser as any).mockResolvedValue({ id: clientId, role: "CLIENT" });
      (prisma.contract.findUnique as any).mockResolvedValue({
        id: contractId,
        title: "Hourly Backend Consulting",
        type: PaymentType.HOURLY,
        status: ContractStatus.ACTIVE,
        clientId,
        freelancerId,
      });
      (prisma.timeEntry.findMany as any).mockResolvedValue([
        {
          id: timeEntryId1,
          contractId,
          status: TimeTrackingStatus.STOPPED,
          reviewStatus: TimesheetReviewStatus.APPROVED,
          isPaid: false,
          billableAmount: 120.5,
        },
        {
          id: timeEntryId2,
          contractId,
          status: TimeTrackingStatus.STOPPED,
          reviewStatus: TimesheetReviewStatus.APPROVED,
          isPaid: false,
          billableAmount: 79.5,
        },
      ]);
      (prisma.payment.findFirst as any).mockResolvedValue(null);

      mockOrdersCreate.mockResolvedValue({
        id: "order_hourly_456",
        amount: 20000, // (120.50 + 79.50) * 100 = 20000 paise
        currency: "INR",
        status: "created",
      });

      (prisma.payment.create as any).mockResolvedValue({
        id: "payrec_hourly_1",
        razorpayOrderId: "order_hourly_456",
      });

      const res = await createTimesheetPaymentOrderAction({
        contractId,
        timeEntryIds: [timeEntryId1, timeEntryId2],
      });

      expect(res.success).toBe(true);
      expect(res.orderId).toBe("order_hourly_456");
      expect(res.amountSubunits).toBe(20000);
      expect(mockOrdersCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 20000,
          currency: "INR",
        })
      );
    });
  });

  describe("Checkout Signature Verification & Local Database Integrity", () => {
    it("updates Payment to SUCCESS and marks milestone paid upon valid signature", async () => {
      (getCurrentUser as any).mockResolvedValue({ id: clientId, role: "CLIENT" });

      const orderId = "order_m1";
      const paymentId = "pay_p1";
      const signature = crypto
        .createHmac("sha256", testKeySecret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

      (prisma.payment.findUnique as any).mockResolvedValue({
        id: "payment_rec_1",
        razorpayOrderId: orderId,
        status: PaymentStatus.PENDING,
        itemType: PaymentItemType.MILESTONE,
        milestoneId,
        timeEntryIds: [],
        amount: 300,
        currency: "INR",
        contractId,
        payerId: clientId,
        recipientId: freelancerId,
      });

      (prisma.payment.update as any).mockResolvedValue({
        id: "payment_rec_1",
        status: PaymentStatus.SUCCESS,
      });

      const res = await verifyPaymentSignatureAction({
        contractId,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      });

      expect(res.success).toBe(true);
      expect(res.paymentId).toBe("payment_rec_1");
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "payment_rec_1" },
          data: expect.objectContaining({
            status: PaymentStatus.SUCCESS,
            razorpayPaymentId: paymentId,
          }),
        })
      );
      expect(prisma.contractMilestone.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: milestoneId },
          data: expect.objectContaining({
            isPaid: true,
          }),
        })
      );
    });

    it("is idempotent: repeatedly verifying an already successful payment returns success without double-updating", async () => {
      (getCurrentUser as any).mockResolvedValue({ id: clientId, role: "CLIENT" });

      const orderId = "order_m1";
      const paymentId = "pay_p1";
      const signature = crypto
        .createHmac("sha256", testKeySecret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

      (prisma.payment.findUnique as any).mockResolvedValue({
        id: "payment_rec_1",
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        status: PaymentStatus.SUCCESS, // Already success!
        itemType: PaymentItemType.MILESTONE,
        milestoneId,
        contractId,
        payerId: clientId,
        recipientId: freelancerId,
      });

      const res = await verifyPaymentSignatureAction({
        contractId,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      });

      expect(res.success).toBe(true);
      // Ensure update transaction was NOT called again
      expect(prisma.payment.update).not.toHaveBeenCalled();
      expect(prisma.contractMilestone.update).not.toHaveBeenCalled();
    });

    it("rejects invalid signature without modifying database records", async () => {
      (getCurrentUser as any).mockResolvedValue({ id: clientId, role: "CLIENT" });

      const orderId = "order_m1";
      const paymentId = "pay_p1";
      const invalidSig = "bad_signature_hex";

      (prisma.payment.findUnique as any).mockResolvedValue({
        id: "payment_rec_1",
        razorpayOrderId: orderId,
        status: PaymentStatus.PENDING,
        contractId,
        payerId: clientId,
        recipientId: freelancerId,
      });

      const res = await verifyPaymentSignatureAction({
        contractId,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: invalidSig,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Invalid gateway signature/i);
      expect(prisma.contractMilestone.update).not.toHaveBeenCalled();
    });
  });

  describe("Razorpay Webhook Endpoint (/api/webhooks/razorpay)", () => {
    const webhookSecret = "whsec_test_secret_999";

    it("settles payment and marks milestone paid upon valid payment.captured webhook", async () => {
      const orderId = "order_wh_1";
      const paymentId = "pay_wh_1";
      const payload = {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: paymentId,
              order_id: orderId,
              amount: 50000,
            },
          },
        },
      };
      const rawBody = JSON.stringify(payload);
      const signature = crypto
        .createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");

      (prisma.payment.findUnique as any).mockResolvedValue({
        id: "payment_rec_wh1",
        razorpayOrderId: orderId,
        status: PaymentStatus.PENDING,
        amountSubunits: 50000,
        itemType: PaymentItemType.MILESTONE,
        milestoneId,
        timeEntryIds: [],
      });

      const request = new Request("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "x-razorpay-signature": signature,
          "content-type": "application/json",
        },
        body: rawBody,
      });

      const response = await webhookHandler(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.received).toBe(true);
      expect(json.settled).toBe(true);
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "payment_rec_wh1" },
          data: expect.objectContaining({
            status: PaymentStatus.SUCCESS,
            razorpayPaymentId: paymentId,
          }),
        })
      );
      expect(prisma.contractMilestone.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: milestoneId },
          data: expect.objectContaining({
            isPaid: true,
          }),
        })
      );
    });

    it("rejects webhook request with invalid signature with 401 Unauthorized", async () => {
      const rawBody = JSON.stringify({ event: "payment.captured" });
      const request = new Request("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "x-razorpay-signature": "tampered_signature_hex",
        },
        body: rawBody,
      });

      const response = await webhookHandler(request);
      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toMatch(/Invalid webhook signature/i);
    });

    it("handles duplicate webhook delivery idempotently without modifying database records", async () => {
      const orderId = "order_wh_1";
      const payload = {
        event: "order.paid",
        payload: {
          order: {
            entity: {
              id: orderId,
              amount: 50000,
            },
          },
        },
      };
      const rawBody = JSON.stringify(payload);
      const signature = crypto
        .createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");

      (prisma.payment.findUnique as any).mockResolvedValue({
        id: "payment_rec_wh1",
        razorpayOrderId: orderId,
        status: PaymentStatus.SUCCESS, // Already processed!
        amountSubunits: 50000,
      });

      const request = new Request("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "x-razorpay-signature": signature,
        },
        body: rawBody,
      });

      const response = await webhookHandler(request);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.status).toBe("already_processed");
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it("rejects webhook event with amount mismatch with 400 Bad Request", async () => {
      const orderId = "order_wh_1";
      const payload = {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_1",
              order_id: orderId,
              amount: 99999, // Mismatched amount
            },
          },
        },
      };
      const rawBody = JSON.stringify(payload);
      const signature = crypto
        .createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");

      (prisma.payment.findUnique as any).mockResolvedValue({
        id: "payment_rec_wh1",
        razorpayOrderId: orderId,
        status: PaymentStatus.PENDING,
        amountSubunits: 50000, // Expected 50000
      });

      const request = new Request("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "x-razorpay-signature": signature,
        },
        body: rawBody,
      });

      const response = await webhookHandler(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toMatch(/Amount mismatch/i);
    });

    it("marks payment as FAILED upon receiving payment.failed webhook event", async () => {
      const orderId = "order_wh_failed";
      const paymentId = "pay_failed_1";
      const payload = {
        event: "payment.failed",
        payload: {
          payment: {
            entity: {
              id: paymentId,
              order_id: orderId,
              error_description: "Bank server declined transaction",
            },
          },
        },
      };
      const rawBody = JSON.stringify(payload);
      const signature = crypto
        .createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");

      (prisma.payment.findUnique as any).mockResolvedValue({
        id: "payment_rec_fail",
        razorpayOrderId: orderId,
        status: PaymentStatus.PENDING,
      });

      const request = new Request("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "x-razorpay-signature": signature,
        },
        body: rawBody,
      });

      const response = await webhookHandler(request);
      expect(response.status).toBe(200);
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "payment_rec_fail" },
          data: expect.objectContaining({
            status: PaymentStatus.FAILED,
            failureReason: "Bank server declined transaction",
          }),
        })
      );
    });
  });
});
