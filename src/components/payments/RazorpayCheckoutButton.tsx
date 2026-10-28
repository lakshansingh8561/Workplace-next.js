"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createMilestonePaymentOrderAction,
  createTimesheetPaymentOrderAction,
  verifyPaymentSignatureAction,
} from "@/lib/actions/payment";

interface RazorpayPrefill {
  name?: string;
  email?: string;
  contact?: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: RazorpayPrefill;
  theme?: {
    color?: string;
  };
  handler?: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  modal?: {
    ondismiss?: () => void;
    confirm_close?: boolean;
    animation?: boolean;
  };
  notes?: Record<string, string>;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => {
      open: () => void;
      close: () => void;
      on: (event: string, handler: (response: unknown) => void) => void;
    };
  }
}

let razorpayScriptPromise: Promise<boolean> | null = null;

export function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === "undefined") {
    return Promise.resolve(false);
  }
  if (window.Razorpay) {
    return Promise.resolve(true);
  }
  if (razorpayScriptPromise) {
    return razorpayScriptPromise;
  }

  razorpayScriptPromise = new Promise<boolean>((resolve) => {
    // 1. Direct check if constructor was defined while promise was created
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    // 2. Check if an existing script tag is already in the document
    const existingScript = document.querySelector(
      'script[src*="checkout.razorpay.com"]'
    ) as HTMLScriptElement | null;

    if (existingScript) {
      if (window.Razorpay) {
        resolve(true);
        return;
      }

      existingScript.addEventListener("load", () => {
        resolve(Boolean(window.Razorpay));
      });
      existingScript.addEventListener("error", () => {
        console.warn("[WorkPulse Razorpay]: Existing checkout.js failed to load.");
        razorpayScriptPromise = null;
        resolve(false);
      });

      // Polling fallback in case load event fired before listener was attached
      const interval = setInterval(() => {
        if (window.Razorpay) {
          clearInterval(interval);
          resolve(true);
        }
      }, 100);

      setTimeout(() => {
        clearInterval(interval);
        if (window.Razorpay) {
          resolve(true);
        } else {
          razorpayScriptPromise = null;
          resolve(false);
        }
      }, 3000);
      return;
    }

    // 3. Insert new script element dynamically
    const script = document.createElement("script");
    script.id = "razorpay-checkout-sdk";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => {
      resolve(Boolean(window.Razorpay));
    };
    script.onerror = () => {
      console.warn(
        "[WorkPulse Razorpay]: Unable to download checkout.js. If an ad-blocker or Brave Shields is running, it may be blocking checkout.razorpay.com."
      );
      razorpayScriptPromise = null;
      resolve(false);
    };

    document.body.appendChild(script);
  });

  return razorpayScriptPromise;
}

interface RazorpayPaymentButtonProps {
  contractId: string;
  itemType: "MILESTONE" | "HOURLY_TIMESHEET";
  milestoneId?: string;
  timeEntryIds?: string[];
  amountLabel: string;
  buttonLabel?: string;
  variant?: "primary" | "secondary" | "compact";
  onPaymentSuccess?: () => void;
  onPaymentError?: (error: string) => void;
}

export function RazorpayPaymentButton({
  contractId,
  itemType,
  milestoneId,
  timeEntryIds,
  amountLabel,
  buttonLabel,
  variant = "primary",
  onPaymentSuccess,
  onPaymentError,
}: RazorpayPaymentButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleInitiatePayment = async () => {
    if (isLoading) return; // Prevent duplicate clicks
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // 1. Ensure Razorpay SDK script is loaded
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded || !window.Razorpay) {
        throw new Error(
          "Unable to load Razorpay Checkout. If you have an AdBlocker, Brave Shields, or privacy extension enabled, please disable it for localhost and try again."
        );
      }

      // 2. Request order creation on the server (server calculates amount & verifies eligibility)
      let orderRes;
      if (itemType === "MILESTONE") {
        if (!milestoneId) {
          throw new Error("Milestone identifier is required for milestone payment.");
        }
        orderRes = await createMilestonePaymentOrderAction({
          contractId,
          milestoneId,
        });
      } else {
        if (!timeEntryIds || timeEntryIds.length === 0) {
          throw new Error("No approved time entries selected for payment.");
        }
        orderRes = await createTimesheetPaymentOrderAction({
          contractId,
          timeEntryIds,
        });
      }

      if (!orderRes.success || !orderRes.orderId || !orderRes.keyId) {
        throw new Error(orderRes.error || "Failed to initialize payment order.");
      }

      const { orderId, keyId, amountSubunits, currency, isTestMode, title } = orderRes;

      // 3. Open Razorpay Checkout Modal
      const rzp = new window.Razorpay({
        key: keyId,
        amount: amountSubunits || 0,
        currency: currency || "USD",
        name: "WorkPulse Marketplace",
        description: `Payment for ${title || "contract deliverable"}`,
        order_id: orderId,
        theme: {
          color: "#059669", // emerald-600
        },
        handler: async (response) => {
          try {
            // 4. Verify checkout signature on server
            const verifyRes = await verifyPaymentSignatureAction({
              contractId,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });

            if (!verifyRes.success) {
              setErrorMessage(verifyRes.error || "Payment signature verification failed.");
              if (onPaymentError) onPaymentError(verifyRes.error || "Verification failed");
            } else {
              setSuccessMessage(
                `Payment confirmed successfully! Payment ID: ${verifyRes.paymentId}`
              );
              if (onPaymentSuccess) onPaymentSuccess();
              router.refresh();
            }
          } catch (verifyErr) {
            const errStr =
              verifyErr instanceof Error
                ? verifyErr.message
                : "An error occurred during payment verification.";
            setErrorMessage(errStr);
            if (onPaymentError) onPaymentError(errStr);
          } finally {
            setIsLoading(false);
          }
        },
        modal: {
          ondismiss: () => {
            setIsLoading(false);
          },
        },
        notes: {
          contractId,
          itemType,
          environment: isTestMode ? "test" : "live",
        },
      });

      rzp.on("payment.failed", (res: unknown) => {
        setIsLoading(false);
        const errObj = (res as { error?: { description?: string } })?.error;
        const msg = errObj?.description || "Payment failed at the gateway.";
        setErrorMessage(msg);
        if (onPaymentError) onPaymentError(msg);
      });

      rzp.open();
    } catch (err) {
      const errStr =
        err instanceof Error ? err.message : "Payment initialization failed.";
      setErrorMessage(errStr);
      if (onPaymentError) onPaymentError(errStr);
      setIsLoading(false);
    }
  };

  const buttonStyle =
    variant === "compact"
      ? "px-3 py-1.5 text-xs font-bold rounded-lg shadow-sm"
      : "px-4 py-2 text-xs font-extrabold rounded-xl shadow";

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleInitiatePayment}
        disabled={isLoading}
        className={`inline-flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed ${buttonStyle}`}
      >
        <span>💳</span>
        <span>
          {isLoading
            ? "Processing..."
            : buttonLabel || `Pay with Razorpay (${amountLabel})`}
        </span>
      </button>

      {errorMessage && (
        <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400 mt-1 max-w-xs">
          ⚠️ {errorMessage}
        </span>
      )}

      {successMessage && (
        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
          ✓ {successMessage}
        </span>
      )}
    </div>
  );
}
