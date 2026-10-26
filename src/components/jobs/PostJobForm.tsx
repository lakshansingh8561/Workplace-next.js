"use client";

import { useState, useTransition, useId } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createJobAction } from "@/lib/actions/job";
import {
  SUPPORTED_CATEGORIES,
  DURATION_OPTIONS,
} from "@/lib/validations/job";

interface PostJobFormProps {
  userName?: string | null;
}

export function PostJobForm({ userName }: PostJobFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Form Fields
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(SUPPORTED_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [skills, setSkills] = useState<string[]>(["Next.js", "TypeScript"]);
  const [skillInput, setSkillInput] = useState("");
  const [type, setType] = useState<"FIXED" | "HOURLY">("FIXED");
  const [budget, setBudget] = useState<number | "">(1500);
  const [hourlyMin, setHourlyMin] = useState<number | "">(45);
  const [hourlyMax, setHourlyMax] = useState<number | "">(75);
  const [duration, setDuration] = useState<string>(DURATION_OPTIONS[1]);
  const [experienceLevel, setExperienceLevel] = useState<"ENTRY" | "INTERMEDIATE" | "EXPERT">(
    "INTERMEDIATE"
  );

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const titleId = useId();
  const categoryId = useId();
  const descId = useId();
  const skillInputId = useId();

  const handleAddSkill = () => {
    const trimmed = skillInput.trim();
    if (trimmed && !skills.includes(trimmed) && skills.length < 10) {
      setSkills([...skills, trimmed]);
      setSkillInput("");
    }
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setSkills(skills.filter((s) => s !== skillToRemove));
  };

  const handleKeyDownSkill = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAddSkill();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;

    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const payload = {
        title,
        category,
        description,
        skills,
        type,
        budget: type === "FIXED" ? (budget === "" ? null : Number(budget)) : null,
        hourlyMin: type === "HOURLY" ? (hourlyMin === "" ? null : Number(hourlyMin)) : null,
        hourlyMax: type === "HOURLY" ? (hourlyMax === "" ? null : Number(hourlyMax)) : null,
        duration,
        experienceLevel,
      };

      const result = await createJobAction(payload);

      if (!result.success) {
        setError(result.error || "Failed to publish job.");
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
      } else if (result.jobId) {
        router.push(`/jobs/${result.jobId}`);
      }
    });
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-10 shadow-xl shadow-zinc-200/40 dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-none">
        <div className="mb-8 pb-6 border-b border-zinc-100 dark:border-zinc-800">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 mb-2">
            Client Job Publisher
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
            Post a new freelance job
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            Posting as <strong>{userName || "Client"}</strong>. Connect with vetted domain experts worldwide.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl bg-red-50 p-4 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900/50"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label
              htmlFor={titleId}
              className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1"
            >
              Job Title
            </label>
            <input
              id={titleId}
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Senior Next.js 16 Full-Stack Engineer for SaaS Dashboard"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            />
            {fieldErrors.title && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {fieldErrors.title}
              </p>
            )}
          </div>

          {/* Category */}
          <div>
            <label
              htmlFor={categoryId}
              className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1"
            >
              Category
            </label>
            <select
              id={categoryId}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            >
              {SUPPORTED_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor={descId}
              className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1"
            >
              Job Description
            </label>
            <textarea
              id={descId}
              required
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the deliverables, timeline, required technologies, and project goals in detail..."
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white leading-relaxed"
            />
            {fieldErrors.description && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {fieldErrors.description}
              </p>
            )}
          </div>

          {/* Skills Input */}
          <div>
            <label
              htmlFor={skillInputId}
              className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1"
            >
              Required Skills (up to 10)
            </label>
            <div className="flex gap-2 mb-2">
              <input
                id={skillInputId}
                type="text"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={handleKeyDownSkill}
                placeholder="Type skill & press Enter (e.g. Next.js, Python, Figma)"
                className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <button
                type="button"
                onClick={handleAddSkill}
                className="rounded-xl border border-zinc-300 bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              >
                Add
              </button>
            </div>

            {/* Selected Skills Chips */}
            <div className="flex flex-wrap gap-2">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => handleRemoveSkill(skill)}
                    className="h-3.5 w-3.5 rounded-full hover:bg-emerald-200 text-emerald-800 dark:hover:bg-emerald-800 dark:text-emerald-200 inline-flex items-center justify-center text-[10px]"
                    aria-label={`Remove ${skill}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
            {fieldErrors.skills && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {fieldErrors.skills}
              </p>
            )}
          </div>

          {/* Payment Type Selection */}
          <div className="pt-2">
            <span className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-2">
              Payment Model
            </span>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex flex-col p-3.5 rounded-2xl border cursor-pointer transition-all ${
                  type === "FIXED"
                    ? "border-emerald-600 bg-emerald-50/40 text-emerald-950 dark:bg-emerald-950/30 dark:border-emerald-500 dark:text-white ring-2 ring-emerald-500/20"
                    : "border-zinc-200 bg-zinc-50/50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-300"
                }`}
              >
                <input
                  type="radio"
                  name="jobType"
                  value="FIXED"
                  checked={type === "FIXED"}
                  onChange={() => setType("FIXED")}
                  className="sr-only"
                />
                <span className="text-xs font-bold">Fixed-Price Contract</span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Set a total project budget with milestone releases.
                </span>
              </label>

              <label
                className={`flex flex-col p-3.5 rounded-2xl border cursor-pointer transition-all ${
                  type === "HOURLY"
                    ? "border-emerald-600 bg-emerald-50/40 text-emerald-950 dark:bg-emerald-950/30 dark:border-emerald-500 dark:text-white ring-2 ring-emerald-500/20"
                    : "border-zinc-200 bg-zinc-50/50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-300"
                }`}
              >
                <input
                  type="radio"
                  name="jobType"
                  value="HOURLY"
                  checked={type === "HOURLY"}
                  onChange={() => setType("HOURLY")}
                  className="sr-only"
                />
                <span className="text-xs font-bold">Hourly Rate</span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Pay for hours tracked with a defined min/max range.
                </span>
              </label>
            </div>
          </div>

          {/* Rate or Budget Inputs */}
          {type === "FIXED" ? (
            <div>
              <label
                htmlFor="budget"
                className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1"
              >
                Total Project Budget ($ USD)
              </label>
              <div className="relative max-w-xs">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-semibold">
                  $
                </span>
                <input
                  id="budget"
                  type="number"
                  min="5"
                  step="1"
                  required
                  value={budget}
                  onChange={(e) => setBudget(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-8 pr-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>
              {fieldErrors.budget && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {fieldErrors.budget}
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 max-w-md">
              <div>
                <label
                  htmlFor="hourlyMin"
                  className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Min Rate ($ / hr)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-semibold">
                    $
                  </span>
                  <input
                    id="hourlyMin"
                    type="number"
                    min="3"
                    step="1"
                    required
                    value={hourlyMin}
                    onChange={(e) =>
                      setHourlyMin(e.target.value === "" ? "" : Number(e.target.value))
                    }
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-8 pr-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                </div>
                {fieldErrors.hourlyMin && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {fieldErrors.hourlyMin}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="hourlyMax"
                  className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Max Rate ($ / hr)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-semibold">
                    $
                  </span>
                  <input
                    id="hourlyMax"
                    type="number"
                    min="3"
                    step="1"
                    required
                    value={hourlyMax}
                    onChange={(e) =>
                      setHourlyMax(e.target.value === "" ? "" : Number(e.target.value))
                    }
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-8 pr-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                </div>
                {fieldErrors.hourlyMax && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {fieldErrors.hourlyMax}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Experience Level & Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="experienceLevel"
                className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1"
              >
                Experience Level
              </label>
              <select
                id="experienceLevel"
                value={experienceLevel}
                onChange={(e) =>
                  setExperienceLevel(e.target.value as "ENTRY" | "INTERMEDIATE" | "EXPERT")
                }
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              >
                <option value="ENTRY">Entry Level (Junior)</option>
                <option value="INTERMEDIATE">Intermediate (Mid-level)</option>
                <option value="EXPERT">Expert (Senior / Lead)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="duration"
                className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1"
              >
                Project Scope / Duration
              </label>
              <select
                id="duration"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-6 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-end gap-3">
            <Link
              href="/jobs"
              className="rounded-xl px-5 py-2.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 active:scale-95 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              {isPending ? "Publishing Job..." : "Publish Job Post"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
