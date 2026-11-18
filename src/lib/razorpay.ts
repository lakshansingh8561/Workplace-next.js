import crypto from "crypto";
import Razorpay from "razorpay";
import { prisma } from "@/lib/prisma";

/**
 * WorkPulse Razorpay Gateway Configuration & Security Utilities
 *
 * Supports both standard Razorpay naming and project-established conventions:
 * - Production: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET
 * - Test / Development: RAZORPAY_TEST_KEY / RAZORPAY_TEST_SECRET
 * - Webhook Secret: RAZORPAY_WEBHOOK_SECRET
 * - Currency: RAZORPAY_CURRENCY (defaults to USD)
 *
 * The secret key is kept strictly server-side and never exposed to the client.
 */

export function getRazorpayCredentials() {
  const isProduction = process.env.NODE_ENV === "production";

  // Check both standard Razorpay naming and project-established test naming
  const rawKeyId =
    (isProduction
      ? process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_LIVE_KEY || process.env.RAZORPAY_TEST_KEY
      : process.env.RAZORPAY_TEST_KEY || process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_LIVE_KEY) || "";

  const rawKeySecret =
    (isProduction
      ? process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_LIVE_SECRET || process.env.RAZORPAY_TEST_SECRET
      : process.env.RAZORPAY_TEST_SECRET || process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_LIVE_SECRET) || "";

  const keyId = rawKeyId.trim();
  const keySecret = rawKeySecret.trim();
  const webhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
  const currency = (process.env.RAZORPAY_CURRENCY || "USD").trim().toUpperCase();

  const isTestMode = keyId.startsWith("rzp_test_");
  const isLiveMode = keyId.startsWith("rzp_live_");

  const environment: "TEST" | "LIVE" | "UNCONFIGURED" = isTestMode
    ? "TEST"
    : isLiveMode
    ? "LIVE"
    : "UNCONFIGURED";

  const isSecretValid = Boolean(keySecret && !/^\*+$/.test(keySecret) && keySecret.length >= 8);
  const isConfigured = Boolean(keyId && isSecretValid && (isTestMode || isLiveMode));

  return {
    keyId,
    keySecret,
    webhookSecret,
    currency,
    isConfigured,
    isTestMode,
    isLiveMode,
    environment,
  };
}

/**
 * Returns safe public client metadata for Razorpay Checkout initialization.
 * Never exposes the key secret or webhook secret.
 */
export function getRazorpayPublicConfig() {
  const creds = getRazorpayCredentials();
  return {
    keyId: creds.keyId,
    isConfigured: creds.isConfigured,
    isTestMode: creds.isTestMode,
    isLiveMode: creds.isLiveMode,
    environment: creds.environment,
    currency: creds.currency,
  };
}

let razorpayInstance: Razorpay | null = null;
let currentClientKeyId: string | null = null;
let currentClientKeySecret: string | null = null;

/**
 * Instantiates the Razorpay SDK client with the active server credentials.
 * Automatically refreshes if environment keys change.
 */
export function getRazorpayClient(): Razorpay {
  const { keyId, keySecret, isConfigured } = getRazorpayCredentials();

  if (!isConfigured) {
    throw new Error(
      "Payment service is temporarily unavailable. Please configure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
    );
  }

  if (
    !razorpayInstance ||
    currentClientKeyId !== keyId ||
    currentClientKeySecret !== keySecret
  ) {
    razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
    currentClientKeyId = keyId;
    currentClientKeySecret = keySecret;
  }

  return razorpayInstance;
}

let hasEnsuredPaymentIndexes = false;

/**
 * Idempotently ensures the MongoDB partial unique index on razorpayPaymentId.
 * This guarantees that multiple pending payments with null razorpayPaymentId can exist
 * concurrently without duplicate key collisions, while strictly enforcing uniqueness
 * for non-null verified payment strings.
 */
export async function ensurePaymentCollectionIndexes(): Promise<void> {
  if (hasEnsuredPaymentIndexes) return;
  try {
    await prisma.$runCommandRaw({
      createIndexes: "payments",
      indexes: [
        {
          key: { razorpayPaymentId: 1 },
          name: "payments_razorpayPaymentId_key",
          unique: true,
          partialFilterExpression: {
            razorpayPaymentId: { $type: "string" },
          },
        },
      ],
    });
    hasEnsuredPaymentIndexes = true;
  } catch {
    hasEnsuredPaymentIndexes = true;
  }
}

export interface SafePaymentLogContext {
  operation: string;
  contractId?: string;
  milestoneId?: string;
  timeEntryIds?: string[];
  amount: number;
  amountSubunits?: number;
  currency: string;
}

/**
 * Safely parses and logs payment gateway errors without ever printing
 * credentials, headers, secrets, or personal data.
 * Returns clean, contextual, user-facing error messages.
 */
export function handlePaymentGatewayError(
  error: unknown,
  context: SafePaymentLogContext
): { userMessage: string; statusCode?: number; errorCode?: string } {
  const creds = getRazorpayCredentials();

  let statusCode: number | undefined;
  let errorCode: string | undefined;
  let errorDescription: string | undefined;
  let rawMessage = "";

  if (typeof error === "object" && error !== null) {
    const errObj = error as Record<string, any>;
    statusCode = typeof errObj.statusCode === "number" ? errObj.statusCode : undefined;
    rawMessage = typeof errObj.message === "string" ? errObj.message : "";

    if (errObj.error && typeof errObj.error === "object") {
      errorCode = typeof errObj.error.code === "string" ? errObj.error.code : undefined;
      errorDescription =
        typeof errObj.error.description === "string" ? errObj.error.description : undefined;
    }

    if (!errorCode && typeof errObj.code === "string") {
      errorCode = errObj.code;
    }
  } else if (typeof error === "string") {
    rawMessage = error;
  }

  // Safe server logging with NO sensitive data
  console.error("[WorkPulse Payment Gateway Error]:", {
    operation: context.operation,
    contractId: context.contractId,
    milestoneId: context.milestoneId,
    environment: creds.environment,
    currency: context.currency,
    amount: context.amount,
    amountSubunits: context.amountSubunits,
    statusCode,
    errorCode,
    errorDescription: errorDescription || rawMessage || "Unknown gateway error",
  });

  // Determine user-friendly, specific error message
  if (!creds.isConfigured) {
    return {
      userMessage: "Payment service is temporarily unavailable. Please contact support.",
      statusCode,
      errorCode,
    };
  }

  if (
    statusCode === 401 ||
    (errorCode === "BAD_REQUEST_ERROR" && errorDescription?.toLowerCase().includes("auth")) ||
    rawMessage.toLowerCase().includes("authentication") ||
    rawMessage.toLowerCase().includes("credentials")
  ) {
    return {
      userMessage: "Payment authentication failed. Please check the payment configuration.",
      statusCode: 401,
      errorCode: errorCode || "AUTH_FAILED",
    };
  }

  if (
    errorDescription?.toLowerCase().includes("currency") ||
    rawMessage.toLowerCase().includes("currency")
  ) {
    return {
      userMessage: "This payment currency is not currently supported.",
      statusCode: 400,
      errorCode: errorCode || "UNSUPPORTED_CURRENCY",
    };
  }

  if (
    errorDescription?.toLowerCase().includes("amount") ||
    rawMessage.toLowerCase().includes("amount") ||
    rawMessage.toLowerCase().includes("transaction limit")
  ) {
    return {
      userMessage: "The payment amount is outside the accepted transaction limits.",
      statusCode: 400,
      errorCode: errorCode || "AMOUNT_OUT_OF_BOUNDS",
    };
  }

  if (errorCode === "P2002") {
    return {
      userMessage:
        "A payment order for this item is currently processing. Please wait a moment and try again.",
      statusCode: 409,
      errorCode: "P2002",
    };
  }

  return {
    userMessage: "Unable to initialize payment. Please try again.",
    statusCode,
    errorCode,
  };
}

/**
 * Verifies Razorpay Checkout signature on the server using HMAC-SHA256.
 * Timing-safe comparison to prevent timing attacks.
 */
export function verifyRazorpaySignature({
  orderId,
  paymentId,
  signature,
  secret,
}: {
  orderId: string;
  paymentId: string;
  signature: string;
  secret?: string;
}): boolean {
  const effectiveSecret = secret || getRazorpayCredentials().keySecret;
  if (!effectiveSecret) return false;

  const payload = `${orderId}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac("sha256", effectiveSecret)
    .update(payload)
    .digest("hex");

  try {
    const expectedBuffer = Buffer.from(expectedSignature, "utf-8");
    const signatureBuffer = Buffer.from(signature, "utf-8");

    if (expectedBuffer.length !== signatureBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
  } catch {
    return false;
  }
}

/**
 * Verifies Razorpay Webhook signature on the server against the exact raw request body.
 * Timing-safe comparison using RAZORPAY_WEBHOOK_SECRET.
 */
export function verifyRazorpayWebhookSignature({
  rawBody,
  signature,
  webhookSecret,
}: {
  rawBody: string;
  signature: string;
  webhookSecret?: string;
}): boolean {
  const effectiveSecret = webhookSecret || getRazorpayCredentials().webhookSecret;
  if (!effectiveSecret || !signature || !rawBody) return false;

  const expectedSignature = crypto
    .createHmac("sha256", effectiveSecret)
    .update(rawBody)
    .digest("hex");

  try {
    const expectedBuffer = Buffer.from(expectedSignature, "utf-8");
    const signatureBuffer = Buffer.from(signature, "utf-8");

    if (expectedBuffer.length !== signatureBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
  } catch {
    return false;
  }
}
