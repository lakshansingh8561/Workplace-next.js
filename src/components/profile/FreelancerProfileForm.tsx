"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updateFreelancerProfileAction, ProfileActionResult } from "@/lib/actions/profile";
import { calculateFreelancerProfileCompletion } from "@/lib/validations/profile";

export interface FreelancerProfileInitialData {
  id: string;
  name: string;
  image?: string | null;
  title?: string | null;
  bio?: string | null;
  skills: string[];
  hourlyRate?: number | null;
  experience?: string | null;
  location?: string | null;
  languages: string[];
  portfolioUrls: string[];
}

interface FreelancerProfileFormProps {
  initialData: FreelancerProfileInitialData;
}

const COMMON_SKILLS = [
  "React",
  "Next.js",
  "TypeScript",
  "Node.js",
  "Tailwind CSS",
  "JavaScript",
  "MongoDB",
  "Prisma",
  "PostgreSQL",
  "UI/UX Design",
  "Figma",
  "Python",
  "GraphQL",
  "REST APIs",
  "Docker",
];

const COMMON_LANGUAGES = [
  "English (Fluent)",
  "English (Native)",
  "Spanish (Conversational)",
  "French (Conversational)",
  "German (Conversational)",
  "Hindi (Native)",
];

export function FreelancerProfileForm({ initialData }: FreelancerProfileFormProps) {
  const [name, setName] = useState(initialData.name || "");
  const [title, setTitle] = useState(initialData.title || "");
  const [bio, setBio] = useState(initialData.bio || "");
  const [skills, setSkills] = useState<string[]>(initialData.skills || []);
  const [skillInput, setSkillInput] = useState("");
  const [hourlyRate, setHourlyRate] = useState<string>(
    initialData.hourlyRate !== undefined && initialData.hourlyRate !== null
      ? String(initialData.hourlyRate)
      : ""
  );
  const [experience, setExperience] = useState(initialData.experience || "");
  const [location, setLocation] = useState(initialData.location || "");
  const [languages, setLanguages] = useState<string[]>(initialData.languages || []);
  const [langInput, setLangInput] = useState("");
  const [portfolioUrls, setPortfolioUrls] = useState<string[]>(
    initialData.portfolioUrls && initialData.portfolioUrls.length > 0
      ? initialData.portfolioUrls
      : [""]
  );

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Dynamic live profile completion calculation
  const currentCompletion = calculateFreelancerProfileCompletion({
    name,
    title,
    bio,
    skills,
    hourlyRate: hourlyRate ? parseFloat(hourlyRate) : null,
    location,
    languages,
    portfolioUrls: portfolioUrls.filter((u) => u.trim().length > 0),
  });

  const handleAddSkill = (skillToAdd: string) => {
    const trimmed = skillToAdd.trim();
    if (!trimmed) return;
    if (skills.some((s) => s.toLowerCase() === trimmed.toLowerCase())) return;
    if (skills.length >= 25) return;
    setSkills([...skills, trimmed]);
    setSkillInput("");
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setSkills(skills.filter((s) => s !== skillToRemove));
  };

  const handleAddLanguage = (langToAdd: string) => {
    const trimmed = langToAdd.trim();
    if (!trimmed) return;
    if (languages.some((l) => l.toLowerCase() === trimmed.toLowerCase())) return;
    if (languages.length >= 10) return;
    setLanguages([...languages, trimmed]);
    setLangInput("");
  };

  const handleRemoveLanguage = (langToRemove: string) => {
    setLanguages(languages.filter((l) => l !== langToRemove));
  };

  const handlePortfolioChange = (index: number, value: string) => {
    const next = [...portfolioUrls];
    next[index] = value;
    setPortfolioUrls(next);
  };

  const handleAddPortfolioField = () => {
    if (portfolioUrls.length < 5) {
      setPortfolioUrls([...portfolioUrls, ""]);
    }
  };

  const handleRemovePortfolioField = (index: number) => {
    const next = portfolioUrls.filter((_, i) => i !== index);
    setPortfolioUrls(next.length === 0 ? [""] : next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setFieldErrors({});
    setSuccessMessage(null);

    const filteredPortfolios = portfolioUrls
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    const payload = {
      name: name.trim(),
      title: title.trim(),
      bio: bio.trim(),
      skills,
      hourlyRate: hourlyRate.trim() ? parseFloat(hourlyRate) : null,
      experience: experience.trim(),
      location: location.trim(),
      languages,
      portfolioUrls: filteredPortfolios,
    };

    startTransition(async () => {
      const res: ProfileActionResult = await updateFreelancerProfileAction(payload);

      if (!res.success) {
        setActionError(res.error || "Failed to update profile.");
        if (res.fieldErrors) {
          setFieldErrors(res.fieldErrors);
        }
        return;
      }

      setSuccessMessage("Your freelancer profile has been successfully updated!");
    });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Navigation breadcrumbs */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/dashboard/freelancer"
          className="text-xs sm:text-sm font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 inline-flex items-center gap-1.5"
        >
          ← Back to Freelancer Dashboard
        </Link>
        <Link
          href={`/freelancers/${initialData.id}`}
          target="_blank"
          className="rounded-xl border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition"
        >
          View Public Profile ↗
        </Link>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
          Freelancer Profile Settings
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
          Highlight your professional expertise, verified skills, and project links to stand out to clients.
        </p>
      </div>

      {/* Profile Completion Meter */}
      <div className="mb-8 rounded-3xl border border-zinc-200/90 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-zinc-900 dark:text-white">
              Profile Strength:
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
              ? "All recommended fields completed 🎉"
              : `${currentCompletion.missing.length} recommendations to reach 100%`}
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

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Section 1: Basic Information */}
        <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 space-y-6">
          <h2 className="text-base font-bold text-zinc-950 dark:text-white pb-3 border-b border-zinc-100 dark:border-zinc-800">
            Basic Information
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="name" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Display Name <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. Alex Morgan"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
              />
              {fieldErrors.name && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.name}</p>
              )}
            </div>

            <div>
              <label htmlFor="location" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Location
              </label>
              <input
                id="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. San Francisco, CA or London, UK"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
              />
              {fieldErrors.location && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.location}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="title" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Professional Title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Senior Full-Stack Next.js & React Developer"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
            />
            {fieldErrors.title && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.title}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="bio" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">
                Professional Overview / Bio
              </label>
              <span className="text-[11px] text-zinc-400">{bio.length}/2000</span>
            </div>
            <textarea
              id="bio"
              rows={5}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Describe your technical background, past accomplishments, architecture philosophy, and how you deliver value for clients..."
              className="w-full rounded-2xl border border-zinc-200 bg-white p-3.5 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
            />
            {fieldErrors.bio && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.bio}</p>
            )}
          </div>
        </div>

        {/* Section 2: Rate & Experience */}
        <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 space-y-6">
          <h2 className="text-base font-bold text-zinc-950 dark:text-white pb-3 border-b border-zinc-100 dark:border-zinc-800">
            Rates & Experience
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="hourlyRate" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Hourly Rate ($ USD / hour)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-xs sm:text-sm font-bold text-zinc-400">$</span>
                <input
                  id="hourlyRate"
                  type="number"
                  min="0"
                  max="9999"
                  step="0.5"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  placeholder="65.00"
                  className="w-full rounded-xl border border-zinc-200 bg-white pl-8 pr-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                />
              </div>
              {fieldErrors.hourlyRate && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.hourlyRate}</p>
              )}
            </div>

            <div>
              <label htmlFor="experience" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                Experience Level
              </label>
              <input
                id="experience"
                type="text"
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
                placeholder="e.g. Expert (6+ years in full-stack engineering)"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
              />
              {fieldErrors.experience && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.experience}</p>
              )}
            </div>
          </div>
        </div>

        {/* Section 3: Skills & Languages */}
        <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 space-y-6">
          <h2 className="text-base font-bold text-zinc-950 dark:text-white pb-3 border-b border-zinc-100 dark:border-zinc-800">
            Skills & Languages
          </h2>

          {/* Skills */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Skills ({skills.length}/25)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddSkill(skillInput);
                  }
                }}
                placeholder="Type a skill and press enter (e.g. React, Next.js, Docker)"
                className="flex-1 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
              />
              <button
                type="button"
                onClick={() => handleAddSkill(skillInput)}
                className="rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition"
              >
                Add Skill
              </button>
            </div>

            {/* Quick Suggestions */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-zinc-400 mr-1">Suggestions:</span>
              {COMMON_SKILLS.filter((s) => !skills.includes(s)).slice(0, 8).map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleAddSkill(suggestion)}
                  className="rounded-lg bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:bg-emerald-50 hover:text-emerald-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition"
                >
                  + {suggestion}
                </button>
              ))}
            </div>

            {/* Active Skills Pills */}
            <div className="mt-4 flex flex-wrap gap-2">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900"
                >
                  <span>{skill}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveSkill(skill)}
                    className="hover:text-red-600 transition"
                  >
                    ✕
                  </button>
                </span>
              ))}
              {skills.length === 0 && (
                <p className="text-xs text-zinc-400 italic">No skills added yet. Add at least 1 skill.</p>
              )}
            </div>
            {fieldErrors.skills && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{fieldErrors.skills}</p>
            )}
          </div>

          {/* Languages */}
          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Languages
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={langInput}
                onChange={(e) => setLangInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddLanguage(langInput);
                  }
                }}
                placeholder="e.g. English (Fluent) or Spanish (Native)"
                className="flex-1 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
              />
              <button
                type="button"
                onClick={() => handleAddLanguage(langInput)}
                className="rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition"
              >
                Add Language
              </button>
            </div>

            {/* Quick Languages */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-zinc-400 mr-1">Common:</span>
              {COMMON_LANGUAGES.filter((l) => !languages.includes(l)).slice(0, 4).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => handleAddLanguage(lang)}
                  className="rounded-lg bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:bg-emerald-50 hover:text-emerald-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition"
                >
                  + {lang}
                </button>
              ))}
            </div>

            {/* Active Languages Pills */}
            <div className="mt-4 flex flex-wrap gap-2">
              {languages.map((lang) => (
                <span
                  key={lang}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  <span>{lang}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveLanguage(lang)}
                    className="hover:text-red-600 transition"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Section 4: Portfolio / Project Links */}
        <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <div>
              <h2 className="text-base font-bold text-zinc-950 dark:text-white">
                Portfolio & Project Links
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Provide verifiable links to your GitHub, live websites, or project demonstrations.
              </p>
            </div>
            {portfolioUrls.length < 5 && (
              <button
                type="button"
                onClick={handleAddPortfolioField}
                className="text-xs font-bold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
              >
                + Add Link
              </button>
            )}
          </div>

          <div className="space-y-3">
            {portfolioUrls.map((url, index) => (
              <div key={index} className="flex gap-2 items-center">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => handlePortfolioChange(index, e.target.value)}
                  placeholder="https://github.com/your-username or https://your-portfolio.com"
                  className="flex-1 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                />
                {portfolioUrls.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemovePortfolioField(index)}
                    className="p-2 text-zinc-400 hover:text-red-600 transition"
                    title="Remove link"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {fieldErrors.portfolioUrls && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.portfolioUrls}</p>
            )}
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-4 pt-4">
          <Link
            href="/dashboard/freelancer"
            className="rounded-xl px-5 py-2.5 text-xs sm:text-sm font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-7 py-3 text-xs sm:text-sm font-bold text-white shadow-md transition hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
          >
            {isPending ? "Saving Profile..." : "Save Profile Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
