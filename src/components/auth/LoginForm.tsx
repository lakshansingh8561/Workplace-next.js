"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { loginUser } from "@/lib/actions/auth";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { sanitizeRedirectPath } from "@/lib/validations/auth";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const isRegistered = searchParams.get("registered") === "true";
  const urlError = searchParams.get("error");
  const redirectTo = sanitizeRedirectPath(searchParams.get("redirectTo"));

  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getUrlErrorMessage = () => {
    if (!urlError) return null;
    switch (urlError) {
      case "OAuthAccountNotLinked":
        return "An account with this email already exists via password sign-in. To protect your account security, automatic linking is disabled. Please sign in with your email and password below.";
      case "UnverifiedEmail":
        return "Your Google email address is not verified by Google. Please verify your email with Google or sign in using a password.";
      case "OAuthSignin":
      case "OAuthCallback":
      case "OAuthCreateAccount":
        return "Google sign-in could not be completed. Please verify your Google credentials and try again.";
      default:
        return "Sign-in failed. Please check your credentials and try again.";
    }
  };

  const activeError = error || getUrlErrorMessage();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const result = await loginUser({
          email,
          password,
          redirectTo,
        });

        if (result && !result.success) {
          setError(result.error || "Invalid credentials.");
        } else {
          router.push(redirectTo);
          router.refresh();
        }
      } catch (err) {
        if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
          return;
        }
        setError("Invalid email or password. Please try again.");
      }
    });
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="rounded-3xl border border-zinc-200/90 bg-white p-8 shadow-xl shadow-zinc-200/50 dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-none">
        <div className="text-center mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 group mb-4"
            aria-label="WorkPulse homepage"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 font-bold text-white shadow-sm transition-transform group-hover:scale-105">
              W
            </span>
            <span className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Work<span className="text-emerald-600">Pulse</span>
            </span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
            Welcome back
          </h1>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Log in to manage your contracts, jobs, and workspace
          </p>
        </div>

        {isRegistered && (
          <div
            role="status"
            className="mb-6 rounded-xl bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50"
          >
            ✓ Account created successfully! Please sign in with your credentials.
          </div>
        )}

        {activeError && (
          <div
            role="alert"
            className="mb-6 rounded-xl bg-red-50 p-3.5 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900/50"
          >
            {activeError}
          </div>
        )}

        {/* Google OAuth Button */}
        <div className="mb-5">
          <GoogleSignInButton
            label="Continue with Google"
            redirectTo={redirectTo}
          />
        </div>

        {/* Divider */}
        <div className="relative mb-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-3 text-[11px] text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500 font-semibold tracking-wider">
              Or continue with email
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
            >
              Email Address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            />
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300"
              >
                Password
              </label>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 pr-10 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs font-medium"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isPending}
            className="w-full mt-2 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 active:scale-95 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            {isPending ? "Signing in..." : "Sign In with Email"}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
          >
            Sign up for free
          </Link>
        </div>
      </div>
    </div>
  );
}
