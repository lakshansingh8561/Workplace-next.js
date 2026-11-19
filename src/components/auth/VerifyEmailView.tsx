"use client";

import { useEffect, useState, useTransition, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  verifyEmailAction,
  sendEmailVerificationOtpAction,
  verifyEmailOtpAction,
  getUserVerificationStateAction,
} from "@/lib/actions/auth-recovery";
import { clearAllAuthCookiesAction } from "@/lib/actions/auth";

export function VerifyEmailView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const emailParam = searchParams.get("email") || "";
  const roleParam = searchParams.get("role") as "CLIENT" | "FREELANCER" | null;
  const isRequired = searchParams.get("required") === "true";
  const emailFailed = searchParams.get("emailFailed") === "true";
  const emailErrorParam = searchParams.get("emailError");

  const [, startTransition] = useTransition();
  const [isOtpPending, startOtpTransition] = useTransition();
  const [isResendPending, startResendTransition] = useTransition();
  const [isSigningOutConflicting, startSignOutTransition] = useTransition();

  const [status, setStatus] = useState<
    "verifying_token" | "otp_entry" | "success" | "alreadyVerified" | "expired" | "error"
  >(token ? "verifying_token" : "otp_entry");

  // Determine initial email with sessionStorage fallback (protects against page refresh)
  const [email, setEmail] = useState(() => {
    if (emailParam) return emailParam.trim().toLowerCase();
    if (typeof window !== "undefined") {
      try {
        const stored = sessionStorage.getItem("workpulse_verify_email");
        if (stored) return stored.trim().toLowerCase();
      } catch {
        // Fallback gracefully
      }
    }
    return "";
  });

  const [userRole, setUserRole] = useState<"CLIENT" | "FREELANCER" | null>(() => {
    if (roleParam) return roleParam;
    if (typeof window !== "undefined") {
      try {
        const storedRole = sessionStorage.getItem("workpulse_verify_role");
        if (storedRole === "CLIENT" || storedRole === "FREELANCER") return storedRole;
      } catch {
        // Fallback gracefully
      }
    }
    return null;
  });

  const [activeSessionEmail, setActiveSessionEmail] = useState<string | null>(null);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Resend countdown state (starts at 60s if email was just registered, else 0)
  const [resendCooldown, setResendCooldown] = useState(emailParam ? 60 : 0);
  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Persist email in sessionStorage whenever emailParam is present
  useEffect(() => {
    if (emailParam && typeof window !== "undefined") {
      try {
        sessionStorage.setItem("workpulse_verify_email", emailParam.trim().toLowerCase());
        if (roleParam) {
          sessionStorage.setItem("workpulse_verify_role", roleParam);
        }
      } catch {
        // Storage restricted
      }
    }
  }, [emailParam, roleParam]);

  // If token is present in URL (legacy verification link)
  const handleVerifyToken = useCallback((tokenToVerify: string) => {
    startTransition(async () => {
      try {
        const result = await verifyEmailAction({ token: tokenToVerify });
        if (result.success) {
          if (result.role) {
            setUserRole(result.role);
          }
          if (result.alreadyVerified) {
            setStatus("alreadyVerified");
          } else {
            setStatus("success");
          }
        } else {
          if (result.expired) {
            setStatus("expired");
          } else {
            setStatus("error");
          }
          setErrorMessage(
            result.error || "Verification link is invalid or has expired."
          );
        }
      } catch {
        setStatus("error");
        setErrorMessage("An unexpected error occurred during verification.");
      }
    });
  }, []);

  useEffect(() => {
    if (token) {
      handleVerifyToken(token);
    }
  }, [token, handleVerifyToken]);

  // Sync authenticated session status to detect any conflicting active user session
  useEffect(() => {
    let active = true;
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((session) => {
        if (!active) return;
        if (session?.user?.email) {
          const sessEmail = session.user.email.toLowerCase().trim();
          setActiveSessionEmail(sessEmail);

          // If no email in URL, populate from verified session
          if (!emailParam) {
            setEmail(sessEmail);
            if (typeof window !== "undefined") {
              try {
                sessionStorage.setItem("workpulse_verify_email", sessEmail);
              } catch {
                // Ignore
              }
            }
          }
        }
        if (session?.user?.role && !roleParam && !userRole) {
          setUserRole(session.user.role as "CLIENT" | "FREELANCER");
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [emailParam, email, roleParam, userRole]);

  // Keep email in sync with URL searchParams
  useEffect(() => {
    if (emailParam && emailParam.trim().toLowerCase() !== email.toLowerCase()) {
      setEmail(emailParam.trim().toLowerCase());
      setOtp(["", "", "", "", "", ""]);
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [emailParam, email]);

  // Query verification state & role by email if unverified or refreshing
  useEffect(() => {
    const targetEmail = (emailParam || email).trim();
    if (!targetEmail) return;

    let active = true;
    getUserVerificationStateAction(targetEmail).then((res) => {
      if (!active) return;
      if (res.exists) {
        if (res.role) {
          setUserRole(res.role);
        }
        if (res.verified) {
          setStatus("alreadyVerified");
        }
      }
    });

    return () => {
      active = false;
    };
  }, [emailParam, email]);

  // Countdown timer for resend button
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  // Focus first OTP input when entering OTP mode
  useEffect(() => {
    if (status === "otp_entry" && email && otpInputsRef.current[0]) {
      otpInputsRef.current[0]?.focus();
    }
  }, [status, email]);

  // Handle typing & replacement into an OTP input box
  const handleOtpChange = (index: number, value: string) => {
    // Clear any previous error when user modifies OTP
    if (errorMessage) setErrorMessage(null);
    if (successMessage) setSuccessMessage(null);

    // Only accept numeric digits
    const cleaned = value.replace(/\D/g, "");

    // If user pasted a full 6-digit code into one box
    if (cleaned.length >= 6) {
      const newOtp = cleaned.slice(0, 6).split("");
      setOtp(newOtp);
      otpInputsRef.current[5]?.focus();
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = cleaned.slice(-1);
    setOtp(newOtp);

    // Auto-advance focus to next digit input
    if (cleaned && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  // Handle keyboard navigation: backspace, left/right arrows
  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (errorMessage) setErrorMessage(null);

    if (e.key === "Backspace") {
      if (otp[index]) {
        // Clear current digit if populated
        const newOtp = [...otp];
        newOtp[index] = "";
        setOtp(newOtp);
      } else if (index > 0) {
        // If current digit is already empty, move to previous box and clear it
        otpInputsRef.current[index - 1]?.focus();
        const newOtp = [...otp];
        newOtp[index - 1] = "";
        setOtp(newOtp);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  // Handle pasting full 6-digit code
  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (errorMessage) setErrorMessage(null);
    if (successMessage) setSuccessMessage(null);

    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const newOtp = [...otp];
    for (let i = 0; i < pasted.length; i++) {
      newOtp[i] = pasted[i];
    }
    setOtp(newOtp);

    const targetFocus = Math.min(5, Math.max(0, pasted.length - 1));
    otpInputsRef.current[targetFocus]?.focus();
  };

  // Sign out conflicting active session to allow smooth verification
  const handleSignOutConflictingSession = () => {
    startSignOutTransition(async () => {
      try {
        await clearAllAuthCookiesAction();
        setActiveSessionEmail(null);
        setErrorMessage(null);
      } catch {
        // Fallback
      }
    });
  };

  // Submit OTP Verification
  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const fullOtp = otp.join("").trim();
    if (fullOtp.length !== 6) {
      setErrorMessage("Please enter all 6 digits of your verification code.");
      return;
    }

    const targetEmail = (emailParam || email).trim().toLowerCase();
    if (!targetEmail) {
      setErrorMessage("Please provide a valid email address.");
      return;
    }

    startOtpTransition(async () => {
      try {
        const result = await verifyEmailOtpAction({
          email: targetEmail,
          otp: fullOtp,
        });

        if (result.success) {
          if (result.role) {
            setUserRole(result.role);
          }
          try {
            sessionStorage.removeItem("workpulse_verify_email");
          } catch {
            // Safe cleanup
          }

          if (result.alreadyVerified) {
            setStatus("alreadyVerified");
          } else {
            setStatus("success");
            setSuccessMessage("Your email address has been verified successfully!");
          }
        } else {
          setErrorMessage(result.error || "Failed to verify code. Please try again.");
          if (result.expired) {
            setStatus("expired");
          }
        }
      } catch {
        setErrorMessage("An unexpected error occurred during verification. Please try again.");
      }
    });
  };

  // Resend OTP Action
  const handleResendOtp = () => {
    const targetEmail = (emailParam || email).trim().toLowerCase();
    if (resendCooldown > 0 || isResendPending || !targetEmail) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    startResendTransition(async () => {
      try {
        const result = await sendEmailVerificationOtpAction({
          email: targetEmail,
        });

        if (result.success) {
          if (result.alreadyVerified) {
            setStatus("alreadyVerified");
          } else {
            setSuccessMessage("A fresh 6-digit verification code has been sent to your email.");
            setResendCooldown(60);
            setOtp(["", "", "", "", "", ""]);
            otpInputsRef.current[0]?.focus();
          }
        } else {
          setErrorMessage(result.error || "Failed to resend verification code.");
        }
      } catch {
        setErrorMessage("An error occurred while requesting a new code.");
      }
    });
  };

  const targetEmailNormalized = (emailParam || email).trim().toLowerCase();
  const hasConflictingSession =
    Boolean(activeSessionEmail) &&
    Boolean(targetEmailNormalized) &&
    activeSessionEmail !== targetEmailNormalized;

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="rounded-3xl border border-zinc-200/90 bg-white p-8 shadow-xl shadow-zinc-200/50 dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-none text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-2 group mb-6"
          aria-label="WorkPulse homepage"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 font-bold text-white shadow-sm transition-transform group-hover:scale-105">
            W
          </span>
          <span className="font-bold text-xl tracking-tight text-zinc-900 dark:text-white">
            Work<span className="text-emerald-600 dark:text-emerald-500">Pulse</span>
          </span>
        </Link>

        {/* State 1: Verifying legacy token */}
        {status === "verifying_token" && (
          <div className="py-6 space-y-4">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
            <h1 className="text-base font-bold text-zinc-900 dark:text-white">
              Verifying your email...
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Please wait while we confirm your email address.
            </p>
          </div>
        )}

        {/* State 2: Success */}
        {status === "success" && (
          <div className="py-4 space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 12.75l6 6 9-13.5"
                />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-white">
              Email Verified Successfully!
            </h1>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-sm mx-auto">
              {userRole === "CLIENT"
                ? "Your client account has been verified. You can now sign in to your WorkPulse account to post jobs, discover talent, and manage your contracts."
                : "Your email address has been verified. You can now sign in to your WorkPulse account to explore freelance opportunities and submit proposals."}
            </p>
            <div className="pt-3">
              <button
                type="button"
                onClick={() => {
                  const targetNorm = (emailParam || email).trim().toLowerCase();
                  if (activeSessionEmail && activeSessionEmail === targetNorm) {
                    router.push(userRole === "CLIENT" ? "/dashboard/client" : "/dashboard/freelancer");
                  } else {
                    router.push("/login?verified=true");
                  }
                  router.refresh();
                }}
                className="w-full inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition-all cursor-pointer"
              >
                {activeSessionEmail && activeSessionEmail === (emailParam || email).trim().toLowerCase()
                  ? "Go to Workspace Dashboard →"
                  : "Sign In to Your Account →"}
              </button>
            </div>
          </div>
        )}

        {/* State 3: Already Verified */}
        {status === "alreadyVerified" && (
          <div className="py-4 space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-white">
              Email Already Verified
            </h1>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-sm mx-auto">
              {userRole === "CLIENT"
                ? "Your client account is already verified. You can now sign in to your WorkPulse account to post jobs, discover talent, and manage contracts."
                : "Your email address is already verified. You can now sign in to your WorkPulse account to explore freelance opportunities and submit proposals."}
            </p>
            <div className="pt-3">
              <button
                type="button"
                onClick={() => {
                  const targetNorm = (emailParam || email).trim().toLowerCase();
                  if (activeSessionEmail && activeSessionEmail === targetNorm) {
                    router.push(userRole === "CLIENT" ? "/dashboard/client" : "/dashboard/freelancer");
                  } else {
                    router.push("/login?verified=true");
                  }
                  router.refresh();
                }}
                className="w-full inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition-all cursor-pointer"
              >
                {activeSessionEmail && activeSessionEmail === (emailParam || email).trim().toLowerCase()
                  ? "Go to Workspace Dashboard →"
                  : "Sign In to Your Account →"}
              </button>
            </div>
          </div>
        )}

        {/* State 4: OTP Entry Form (Primary Workflow) */}
        {(status === "otp_entry" || status === "expired" || status === "error") && (
          <div className="py-2 text-left">
            <div className="text-center mb-6">
              {isRequired && (
                <div
                  role="alert"
                  className="mb-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300 font-medium text-left"
                >
                  <p className="font-semibold mb-0.5">Verification Required</p>
                  <p>
                    Please verify your email address to submit proposals, post contracts, or send direct messages.
                  </p>
                </div>
              )}

              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 mb-3 border border-emerald-100 dark:border-emerald-900">
                <span className="text-xl">✉️</span>
              </div>

              <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white mb-1.5">
                Verify Your Email Address
              </h1>

              {email ? (
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Enter the 6-digit code sent to{" "}
                  <strong className="font-semibold text-zinc-900 dark:text-zinc-100 break-all">
                    {email}
                  </strong>
                </p>
              ) : (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Enter your email address and 6-digit verification code below.
                </p>
              )}
              {process.env.NODE_ENV !== "production" && (
                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                  ⚡ Dev mode: Check your server terminal if using a temporary inbox (like YOPmail).
                </p>
              )}
            </div>

            {/* Email Provider Delivery Warning Notice */}
            {emailFailed && (
              <div
                role="alert"
                className="mb-4 rounded-2xl border border-amber-300 bg-amber-50/90 p-4 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200 shadow-sm text-left"
              >
                <p className="font-semibold text-amber-900 dark:text-amber-100 mb-1 flex items-center gap-1.5">
                  <span>⚠️</span>
                  <span>Verification Email Delivery Notice</span>
                </p>
                <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                  {emailErrorParam ||
                    "We created your account, but the verification email could not be delivered automatically by the configured email provider."}
                </p>
                <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
                  Please verify your email credentials on Render, or click <strong>Resend Code</strong> below.
                </p>
              </div>
            )}

            {/* Conflicting Session Notice & One-Click Signout */}
            {hasConflictingSession && (
              <div
                role="alert"
                className="mb-4 rounded-2xl border border-amber-300 bg-amber-50/90 p-4 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200 shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="font-semibold text-amber-900 dark:text-amber-100 mb-0.5">
                      Different Account Signed In
                    </p>
                    <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                      You are signed in as <strong>{activeSessionEmail}</strong>. To verify <strong>{targetEmailNormalized}</strong>, sign out of the active account first.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isSigningOutConflicting}
                    onClick={handleSignOutConflictingSession}
                    className="shrink-0 rounded-xl bg-amber-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500 cursor-pointer disabled:opacity-50 text-center transition"
                  >
                    {isSigningOutConflicting ? "Signing out..." : "Sign Out to Verify"}
                  </button>
                </div>
              </div>
            )}

            {errorMessage && (
              <div
                role="alert"
                className="mb-4 rounded-xl border border-red-200 bg-red-50/80 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400 font-medium text-center"
              >
                {errorMessage}
              </div>
            )}

            {successMessage && (
              <div
                role="status"
                className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300 font-medium text-center"
              >
                ✓ {successMessage}
              </div>
            )}

            <form onSubmit={handleVerifyOtp} className="space-y-5">
              {!emailParam && (
                <div>
                  <label
                    htmlFor="verify-email-input"
                    className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
                  >
                    Email Address
                  </label>
                  <input
                    id="verify-email-input"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => {
                      if (errorMessage) setErrorMessage(null);
                      setEmail(e.target.value);
                    }}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                </div>
              )}

              {/* 6 Digit Inputs */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2 text-center">
                  6-Digit Verification Code
                </label>
                <div
                  className="flex items-center justify-center gap-2 sm:gap-2.5"
                  onPaste={handleOtpPaste}
                >
                  {otp.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => {
                        otpInputsRef.current[idx] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      disabled={isOtpPending}
                      aria-label={`Digit ${idx + 1}`}
                      className="h-12 w-11 sm:h-13 sm:w-12 text-center text-xl font-bold font-mono rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-900 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:bg-zinc-900 transition-all disabled:opacity-50"
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isOtpPending || otp.join("").length !== 6 || !email.trim()}
                className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {isOtpPending ? "Verifying code..." : "Verify & Continue"}
              </button>

              {/* Resend Section */}
              <div className="pt-2 text-center border-t border-zinc-100 dark:border-zinc-800">
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5">
                  Didn&apos;t receive the code?
                </p>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || isResendPending || !email.trim()}
                  className="text-xs font-bold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition"
                >
                  {isResendPending
                    ? "Sending code..."
                    : resendCooldown > 0
                    ? `Resend code in ${resendCooldown}s`
                    : "Resend Code"}
                </button>
              </div>

              <div className="text-center pt-2">
                <Link
                  href="/login"
                  className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  ← Back to Sign In
                </Link>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
