"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updateClientProfileAction, ProfileActionResult } from "@/lib/actions/profile";
import { calculateClientProfileCompletion } from "@/lib/validations/profile";

export interface ClientProfileInitialData {
  id: string;
  name: string;
  image?: string | null;
  companyName?: string | null;
  companyDescription?: string | null;
  companyWebsite?: string | null;
  companyIndustry?: string | null;
  location?: string | null;
}

interface ClientProfileFormProps {
  initialData: ClientProfileInitialData;
}

const COMMON_INDUSTRIES = [
  "Technology & Software",
  "Fintech & Financial Services",
  "E-commerce & Retail",
  "Healthcare & Life Sciences",
  "Marketing & Advertising",
  "Media & Entertainment",
  "Education & EdTech",
  "Consulting & Professional Services",
];

export function ClientProfileForm({ initialData }: ClientProfileFormProps) {
  const [name, setName] = useState(initialData.name || "");
  const [companyName, setCompanyName] = useState(initialData.companyName || "");
  const [companyDescription, setCompanyDescription] = useState(
    initialData.companyDescription || ""
  );
  const [companyWebsite, setCompanyWebsite] = useState(
    initialData.companyWebsite || ""
  );
  const [companyIndustry, setCompanyIndustry] = useState(
    initialData.companyIndustry || ""
  );
  const [location, setLocation] = useState(initialData.location || "");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const currentCompletion = calculateClientProfileCompletion({
    name,
    companyName,
    companyDescription,
    companyIndustry,
    location,
    companyWebsite,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setFieldErrors({});
    setSuccessMessage(null);

    const payload = {
      name: name.trim(),
      companyName: companyName.trim(),
      companyDescription: companyDescription.trim(),
      companyWebsite: companyWebsite.trim(),
      companyIndustry: companyIndustry.trim(),
      location: location.trim(),
    };

    startTransition(async () => {
      const res: ProfileActionResult = await updateClientProfileAction(payload);

      if (!res.success) {
        setActionError(res.error || "Failed to update client profile.");
        if (res.fieldErrors) {
          setFieldErrors(res.fieldErrors);
        }
        return;
      }

      setSuccessMessage("Your company profile has been successfully saved!");
    });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Navigation breadcrumbs */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/dashboard/client"
          className="text-xs sm:text-sm font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 inline-flex items-center gap-1.5"
        >
          ← Back to Client Dashboard
        </Link>
        <Link
          href="/jobs/new"
          className="rounded-xl border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition"
        >
          Post a New Job ↗
        </Link>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
          Client Company Profile
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
          Present your organization, mission, and industry context to attract top-tier freelance talent.
        </p>
      </div>

      {/* Profile Completion Meter */}
      <div className="mb-8 rounded-3xl border border-zinc-200/90 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-zinc-900 dark:text-white">
              Company Profile Strength:
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${
                currentCompletion.score >= 80
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                  : currentCompletion.score >= 50
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400"
                  : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {currentCompletion.score}%
            </span>
          </div>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {currentCompletion.score === 100
              ? "All company details completed 🎉"
              : `${currentCompletion.missing.length} recommendations remaining`}
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-2.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              currentCompletion.score >= 80
                ? "bg-emerald-500"
                : currentCompletion.score >= 50
                ? "bg-amber-500"
                : "bg-zinc-400"
            }`}
            style={{ width: `${currentCompletion.score}%` }}
          />
        </div>

        {/* Missing suggestions */}
        {currentCompletion.missing.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">Add to improve:</span>
            {currentCompletion.missing.map((item) => (
              <span
                key={item}
                className="rounded-lg bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-300 border border-zinc-200/60 dark:border-zinc-700"
              >
                + {item}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Success Banner */}
      {successMessage && (
        <div className="mb-6 rounded-2xl bg-emerald-50 p-4 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 text-xs sm:text-sm font-semibold text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>✅</span>
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Global Error Banner */}
      {actionError && (
        <div className="mb-6 rounded-2xl bg-red-50 p-4 border border-red-200 dark:bg-red-950/40 dark:border-red-900 text-xs sm:text-sm font-semibold text-red-800 dark:text-red-300 flex items-center justify-between">
          <span>⚠️ {actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-700 hover:text-red-900 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Section 1: Contact & Company Identification */}
        <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 space-y-6">
          <h2 className="text-base font-bold text-zinc-950 dark:text-white pb-3 border-b border-zinc-100 dark:border-zinc-800">
            Company & Contact Details
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="name" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Contact Person / Manager Name <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. Jordan Smith"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
              />
              {fieldErrors.name && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.name}</p>
              )}
            </div>

            <div>
              <label htmlFor="companyName" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Company / Organization Name
              </label>
              <input
                id="companyName"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Nexus Software Solutions"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
              />
              {fieldErrors.companyName && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.companyName}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="companyIndustry" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Primary Industry
              </label>
              <input
                id="companyIndustry"
                type="text"
                value={companyIndustry}
                onChange={(e) => setCompanyIndustry(e.target.value)}
                placeholder="e.g. Technology & Software"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
              />
              {/* Quick suggestions */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {COMMON_INDUSTRIES.slice(0, 4).map((ind) => (
                  <button
                    key={ind}
                    type="button"
                    onClick={() => setCompanyIndustry(ind)}
                    className="rounded-lg bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-600 hover:bg-emerald-50 hover:text-emerald-700 dark:bg-zinc-800 dark:text-zinc-300 transition"
                  >
                    {ind}
                  </button>
                ))}
              </div>
              {fieldErrors.companyIndustry && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.companyIndustry}</p>
              )}
            </div>

            <div>
              <label htmlFor="location" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Headquarters Location
              </label>
              <input
                id="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Austin, TX, USA"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
              />
              {fieldErrors.location && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.location}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="companyWebsite" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Official Website URL
            </label>
            <input
              id="companyWebsite"
              type="url"
              value={companyWebsite}
              onChange={(e) => setCompanyWebsite(e.target.value)}
              placeholder="https://nexussoftware.example.com"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
            />
            {fieldErrors.companyWebsite && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.companyWebsite}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="companyDescription" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">
                Company Overview & Mission
              </label>
              <span className="text-[11px] text-zinc-400">{companyDescription.length}/2000</span>
            </div>
            <textarea
              id="companyDescription"
              rows={5}
              value={companyDescription}
              onChange={(e) => setCompanyDescription(e.target.value)}
              placeholder="Tell freelancers about what your company builds, the problems you solve, company culture, and what you look for in long-term collaborators..."
              className="w-full rounded-2xl border border-zinc-200 bg-white p-3.5 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
            />
            {fieldErrors.companyDescription && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.companyDescription}</p>
            )}
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-4 pt-4">
          <Link
            href="/dashboard/client"
            className="rounded-xl px-5 py-2.5 text-xs sm:text-sm font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-7 py-3 text-xs sm:text-sm font-bold text-white shadow-md transition hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
          >
            {isPending ? "Saving Profile..." : "Save Company Profile"}
          </button>
        </div>
      </form>
    </div>
  );
}
