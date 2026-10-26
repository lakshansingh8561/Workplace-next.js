"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { registerUser } from "@/lib/actions/auth";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

export function SignupForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [role, setRole] = useState<"CLIENT" | "FREELANCER">("CLIENT");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await registerUser({
        name,
        email,
        password,
        role,
      });

      if (!result.success) {
        setError(result.error || "Failed to create account.");
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
      } else {
        router.push("/login?registered=true");
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
            Create your account
          </h1>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Join thousands of businesses and independent professionals
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl bg-red-50 p-3.5 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900/50"
          >
            {error}
          </div>
        )}

        {/* Google OAuth Button */}
        <div className="mb-5">
          <GoogleSignInButton
            label="Sign up with Google"
            redirectTo="/onboarding/role"
          />
        </div>

        {/* Divider */}
        <div className="relative mb-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-3 text-[11px] text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500 font-semibold tracking-wider">
              Or register with email
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Role Selection */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
              I want to:
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole("CLIENT")}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                  role === "CLIENT"
                    ? "border-emerald-600 bg-emerald-50/50 text-emerald-950 dark:bg-emerald-950/30 dark:border-emerald-500 dark:text-emerald-300 ring-2 ring-emerald-500/20"
                    : "border-zinc-200 bg-zinc-50/50 text-zinc-700 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-300"
                }`}
              >
                <span className="text-sm font-bold">Hire Talent</span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  I am a Client
                </span>
              </button>

              <button
                type="button"
                onClick={() => setRole("FREELANCER")}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                  role === "FREELANCER"
                    ? "border-emerald-600 bg-emerald-50/50 text-emerald-950 dark:bg-emerald-950/30 dark:border-emerald-500 dark:text-emerald-300 ring-2 ring-emerald-500/20"
                    : "border-zinc-200 bg-zinc-50/50 text-zinc-700 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-300"
                }`}
              >
                <span className="text-sm font-bold">Find Work</span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  I am a Freelancer
                </span>
              </button>
            </div>
          </div>

          {/* Full Name */}
          <div>
            <label
              htmlFor="name"
              className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
            >
              Full Name
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sarah Connor"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            />
            {fieldErrors.name && (
              <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                {fieldErrors.name}
              </p>
            )}
          </div>

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
            {fieldErrors.email && (
              <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                {fieldErrors.email}
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters with letters & numbers"
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
            {fieldErrors.password ? (
              <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                {fieldErrors.password}
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-zinc-400">
                Minimum 8 characters with at least one letter and one number
              </p>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isPending}
            className="w-full mt-2 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 active:scale-95 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            {isPending ? "Creating your account..." : "Create Account with Email"}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
          >
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
