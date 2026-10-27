import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PaymentItemType, PaymentStatus } from "@prisma/client";
import {
  getRazorpayCredentials,
  verifyRazorpayWebhookSignature,
} from "@/lib/razorpay";

/**
 * Razorpay Webhook Handler Endpoint
 *
 * Verifies webhook signatures using RAZORPAY_WEBHOOK_SECRET against the exact raw request body.
 * Implements idempotent processing: repeated webhook deliveries will not double-credit payments
 * or duplicate local records.
 */
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature") || "";

    const { webhookSecret } = getRazorpayCredentials();

    // Verify webhook signature if secret is configured
    if (webhookSecret) {
      const isValid = verifyRazorpayWebhookSignature({ rawBody, signature });
      if (!isValid) {
        console.warn("[WorkPulse Razorpay Webhook] Invalid webhook signature detected.");
        return NextResponse.json(
          { error: "Invalid webhook signature." },
          { status: 401 }
        );
      }
    } else {
      console.warn(
        "[WorkPulse Razorpay Webhook] RAZORPAY_WEBHOOK_SECRET is not configured. Webhook received without signature verification."
      );
    }

    const event = JSON.parse(rawBody);
    const eventName = event.event;

    // Process payment success / capture events
    if (eventName === "payment.captured" || eventName === "order.paid") {
      const paymentEntity = event.payload?.payment?.entity;
      const orderEntity = event.payload?.order?.entity;
      const orderId = paymentEntity?.order_id || orderEntity?.id;
      const paymentId = paymentEntity?.id;

      if (!orderId) {
        return NextResponse.json(
          { error: "Missing order ID in webhook payload." },
          { status: 400 }
        );
      }

      const payment = await prisma.payment.findUnique({
        where: { razorpayOrderId: orderId },
      });

      if (!payment) {
        console.warn(`[WorkPulse Razorpay Webhook] Order ${orderId} not found in database.`);
        return NextResponse.json({ received: true, note: "Order not tracked locally." });
      }

      // Idempotency check: Already processed
      if (payment.status === PaymentStatus.SUCCESS) {
        return NextResponse.json({
          received: true,
          status: "already_processed",
        });
      }

      // Verify amount match
      const entityAmount = paymentEntity?.amount || orderEntity?.amount;
      if (entityAmount && entityAmount !== payment.amountSubunits) {
        console.error(
          `[WorkPulse Razorpay Webhook] Amount mismatch for order ${orderId}: expected ${payment.amountSubunits}, got ${entityAmount}`
        );
        return NextResponse.json(
          { error: "Amount mismatch detected in webhook event." },
          { status: 400 }
        );
      }

      const now = new Date();

      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.SUCCESS,
            razorpayPaymentId: paymentId || payment.razorpayPaymentId,
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

      return NextResponse.json({ received: true, settled: true });
    }

    // Process payment failure events
    if (eventName === "payment.failed") {
      const paymentEntity = event.payload?.payment?.entity;
      const orderId = paymentEntity?.order_id;

      if (orderId) {
        const payment = await prisma.payment.findUnique({
          where: { razorpayOrderId: orderId },
        });

        if (payment && payment.status !== PaymentStatus.SUCCESS) {
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.FAILED,
              failureReason:
                paymentEntity?.error_description || "Payment failed via Razorpay gateway.",
              razorpayPaymentId: paymentEntity?.id,
            },
          });
        }
      }

      return NextResponse.json({ received: true, recorded_failure: true });
    }

    return NextResponse.json({ received: true, ignored: eventName });
  } catch (error) {
    console.error("[WorkPulse Razorpay Webhook Error]:", error);
    return NextResponse.json(
      { error: "Internal server error processing webhook." },
      { status: 500 }
    );
  }
}
