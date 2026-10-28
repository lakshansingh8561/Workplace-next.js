import crypto from "crypto";
import Razorpay from "razorpay";

/**
 * WorkPulse Razorpay Gateway Configuration & Security Utilities
 *
 * Reads exact environment variable names from .env:
 * - Key ID: RAZORPAY_TEST_KEY (fallback to RAZORPAY_KEY_ID)
 * - Key Secret: RAZORPAY_TEST_SECRET (fallback to RAZORPAY_KEY_SECRET)
 * - Webhook Secret: RAZORPAY_WEBHOOK_SECRET
 *
 * The secret key is kept strictly server-side and never exposed to the client.
 */

export function getRazorpayCredentials() {
  const keyId = process.env.RAZORPAY_TEST_KEY || process.env.RAZORPAY_KEY_ID || "";
  const keySecret = process.env.RAZORPAY_TEST_SECRET || process.env.RAZORPAY_KEY_SECRET || "";
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
  const currency = process.env.RAZORPAY_CURRENCY || "USD";

  return {
    keyId,
    keySecret,
    webhookSecret,
    currency,
    isConfigured: Boolean(keyId && keySecret && !/^\*+$/.test(keySecret)),
    isTestMode: keyId.startsWith("rzp_test_"),
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
    currency: creds.currency,
  };
}

let razorpayInstance: Razorpay | null = null;

/**
 * Instantiates the Razorpay SDK client.
 */
export function getRazorpayClient(): Razorpay {
  const { keyId, keySecret, isConfigured } = getRazorpayCredentials();

  if (!isConfigured) {
    throw new Error(
      "Razorpay credentials are not configured or invalid in .env. Please set RAZORPAY_TEST_KEY and RAZORPAY_TEST_SECRET."
    );
  }

  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  return razorpayInstance;
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
