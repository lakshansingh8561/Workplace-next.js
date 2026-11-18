"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updateFreelancerProfileAction, ProfileActionResult } from "@/lib/actions/profile";
import { ProfilePhotoUpload } from "@/components/profile/ProfilePhotoUpload";
import {
  calculateFreelancerProfileCompletion,
  PortfolioProjectInput,
  EmploymentHistoryInput,
  EducationHistoryInput,
  CertificationInput,
} from "@/lib/validations/profile";

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
  isAvailable?: boolean;
  visibility?: "PUBLIC" | "PRIVATE";
  portfolioProjects?: PortfolioProjectInput[];
  employmentHistory?: EmploymentHistoryInput[];
  educationHistory?: EducationHistoryInput[];
  certifications?: CertificationInput[];
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

  // Phase 5: Rate & Availability, Visibility
  const [isAvailable, setIsAvailable] = useState<boolean>(initialData.isAvailable ?? true);
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">(
    initialData.visibility || "PUBLIC"
  );

  // Phase 5: Portfolio Projects
  const [portfolioProjects, setPortfolioProjects] = useState<PortfolioProjectInput[]>(
    (initialData.portfolioProjects || []).map((p) => ({
      ...p,
      description: p.description ?? "",
      projectUrl: p.projectUrl ?? "",
      imageUrl: p.imageUrl ?? "",
      skills: p.skills || [],
    }))
  );

  // Phase 5: Employment History
  const [employmentHistory, setEmploymentHistory] = useState<EmploymentHistoryInput[]>(
    (initialData.employmentHistory || []).map((e) => ({
      ...e,
      location: e.location ?? "",
      endDate: e.endDate ?? "",
      description: e.description ?? "",
    }))
  );

  // Phase 5: Education History
  const [educationHistory, setEducationHistory] = useState<EducationHistoryInput[]>(
    (initialData.educationHistory || []).map((ed) => ({
      ...ed,
      degree: ed.degree ?? "",
      fieldOfStudy: ed.fieldOfStudy ?? "",
      startYear: ed.startYear ?? "",
      endYear: ed.endYear ?? "",
      description: ed.description ?? "",
    }))
  );

  // Phase 5: Certifications
  const [certifications, setCertifications] = useState<CertificationInput[]>(
    (initialData.certifications || []).map((c) => ({
      ...c,
      issueDate: c.issueDate ?? "",
      expiryDate: c.expiryDate ?? "",
      credentialId: c.credentialId ?? "",
      credentialUrl: c.credentialUrl ?? "",
    }))
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
    portfolioProjects,
    employmentHistory,
    educationHistory,
    certifications,
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
    if (portfolioUrls.length < 10) {
      setPortfolioUrls([...portfolioUrls, ""]);
    }
  };

  const handleRemovePortfolioField = (index: number) => {
    const next = portfolioUrls.filter((_, i) => i !== index);
    setPortfolioUrls(next.length === 0 ? [""] : next);
  };

  // Portfolio Projects Management
  const handleAddProject = () => {
    if (portfolioProjects.length >= 10) return;
    setPortfolioProjects([
      ...portfolioProjects,
      {
        id: crypto.randomUUID(),
        title: "",
        description: "",
        projectUrl: "",
        imageUrl: "",
        skills: [],
      },
    ]);
  };

  const handleUpdateProject = (
    index: number,
    field: keyof PortfolioProjectInput,
    value: string | string[]
  ) => {
    const updated = [...portfolioProjects];
    updated[index] = { ...updated[index], [field]: value };
    setPortfolioProjects(updated);
  };

  const handleRemoveProject = (index: number) => {
    setPortfolioProjects(portfolioProjects.filter((_, i) => i !== index));
  };

  // Employment History Management
  const handleAddEmployment = () => {
    if (employmentHistory.length >= 15) return;
    setEmploymentHistory([
      ...employmentHistory,
      {
        id: crypto.randomUUID(),
        company: "",
        position: "",
        location: "",
        startDate: "",
        endDate: "",
        current: false,
        description: "",
      },
    ]);
  };

  const handleUpdateEmployment = (
    index: number,
    field: keyof EmploymentHistoryInput,
    value: string | boolean
  ) => {
    const updated = [...employmentHistory];
    updated[index] = { ...updated[index], [field]: value };
    setEmploymentHistory(updated);
  };

  const handleRemoveEmployment = (index: number) => {
    setEmploymentHistory(employmentHistory.filter((_, i) => i !== index));
  };

  // Education History Management
  const handleAddEducation = () => {
    if (educationHistory.length >= 10) return;
    setEducationHistory([
      ...educationHistory,
      {
        id: crypto.randomUUID(),
        institution: "",
        degree: "",
        fieldOfStudy: "",
        startYear: "",
        endYear: "",
        description: "",
      },
    ]);
  };

  const handleUpdateEducation = (
    index: number,
    field: keyof EducationHistoryInput,
    value: string
  ) => {
    const updated = [...educationHistory];
    updated[index] = { ...updated[index], [field]: value };
    setEducationHistory(updated);
  };

  const handleRemoveEducation = (index: number) => {
    setEducationHistory(educationHistory.filter((_, i) => i !== index));
  };

  // Certification Management
  const handleAddCertification = () => {
    if (certifications.length >= 10) return;
    setCertifications([
      ...certifications,
      {
        id: crypto.randomUUID(),
        name: "",
        issuer: "",
        issueDate: "",
        expiryDate: "",
        credentialId: "",
        credentialUrl: "",
      },
    ]);
  };

  const handleUpdateCertification = (
    index: number,
    field: keyof CertificationInput,
    value: string
  ) => {
    const updated = [...certifications];
    updated[index] = { ...updated[index], [field]: value };
    setCertifications(updated);
  };

  const handleRemoveCertification = (index: number) => {
    setCertifications(certifications.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setFieldErrors({});
    setSuccessMessage(null);

    const filteredPortfolios = portfolioUrls
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    const filteredProjects = portfolioProjects
      .filter((p) => p.title.trim().length > 0)
      .map((p) => ({
        ...p,
        title: p.title.trim(),
        description: p.description?.trim() || "",
        projectUrl: p.projectUrl?.trim() || "",
        imageUrl: p.imageUrl?.trim() || "",
      }));

    const filteredEmployment = employmentHistory
      .filter((e) => e.company.trim().length > 0 && e.position.trim().length > 0)
      .map((e) => ({
        ...e,
        company: e.company.trim(),
        position: e.position.trim(),
        location: e.location?.trim() || "",
        startDate: e.startDate.trim(),
        endDate: e.current ? "" : e.endDate?.trim() || "",
        description: e.description?.trim() || "",
      }));

    const filteredEducation = educationHistory
      .filter((ed) => ed.institution.trim().length > 0)
      .map((ed) => ({
        ...ed,
        institution: ed.institution.trim(),
        degree: ed.degree?.trim() || "",
        fieldOfStudy: ed.fieldOfStudy?.trim() || "",
        startYear: ed.startYear?.trim() || "",
        endYear: ed.endYear?.trim() || "",
        description: ed.description?.trim() || "",
      }));

    const filteredCertifications = certifications
      .filter((c) => c.name.trim().length > 0 && c.issuer.trim().length > 0)
      .map((c) => ({
        ...c,
        name: c.name.trim(),
        issuer: c.issuer.trim(),
        issueDate: c.issueDate?.trim() || "",
        expiryDate: c.expiryDate?.trim() || "",
        credentialId: c.credentialId?.trim() || "",
        credentialUrl: c.credentialUrl?.trim() || "",
      }));

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
      isAvailable,
      visibility,
      portfolioProjects: filteredProjects,
      employmentHistory: filteredEmployment,
      educationHistory: filteredEducation,
      certifications: filteredCertifications,
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
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
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
          Highlight your professional expertise, verified work experience, education, certifications, and portfolio projects to win more client contracts.
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
              ? "All recommended sections completed 🎉"
              : `${currentCompletion.missing.length} recommendation${
                  currentCompletion.missing.length > 1 ? "s" : ""
                } to reach 100%`}
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

      {/* Profile Photo Upload */}
      <div className="mb-8">
        <ProfilePhotoUpload
          initialImage={initialData.image}
          userName={name}
          userRole="FREELANCER"
          userId={initialData.id}
        />
      </div>

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

        {/* Section 2: Rate, Availability & Visibility */}
        <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 space-y-6">
          <h2 className="text-base font-bold text-zinc-950 dark:text-white pb-3 border-b border-zinc-100 dark:border-zinc-800">
            Rate, Availability & Visibility
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

          {/* Availability Status Cards */}
          <div className="pt-2">
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-2">
              Workplace Availability
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setIsAvailable(true)}
                className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                  isAvailable
                    ? "border-emerald-500 bg-emerald-50/50 dark:border-emerald-500 dark:bg-emerald-950/20"
                    : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
                }`}
              >
                <span className="text-xl">🟢</span>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white">
                    Available for Work
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    Your profile indicates you are open to new project invitations and contract offers.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setIsAvailable(false)}
                className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                  !isAvailable
                    ? "border-amber-500 bg-amber-50/50 dark:border-amber-500 dark:bg-amber-950/20"
                    : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
                }`}
              >
                <span className="text-xl">⚪</span>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white">
                    Currently Busy / Unavailable
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    Indicates you are currently booked with existing clients and not taking on new work.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Visibility Setting Cards */}
          <div className="pt-2">
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-2">
              Profile Visibility
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setVisibility("PUBLIC")}
                className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                  visibility === "PUBLIC"
                    ? "border-emerald-500 bg-emerald-50/50 dark:border-emerald-500 dark:bg-emerald-950/20"
                    : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
                }`}
              >
                <span className="text-xl">🌐</span>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white">
                    Public (Recommended)
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    Discoverable by clients in search results, job proposals, and public URLs.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setVisibility("PRIVATE")}
                className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                  visibility === "PRIVATE"
                    ? "border-amber-500 bg-amber-50/50 dark:border-amber-500 dark:bg-amber-950/20"
                    : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
                }`}
              >
                <span className="text-xl">🔒</span>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white">
                    Private
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    Hidden from public marketplace searches. Only visible to you when logged in.
                  </p>
                </div>
              </button>
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

        {/* Section 4: Detailed Portfolio Projects */}
        <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <div>
              <h2 className="text-base font-bold text-zinc-950 dark:text-white">
                Portfolio Projects ({portfolioProjects.length}/10)
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Showcase case studies and live demos with screenshots, descriptions, and technologies used.
              </p>
            </div>
            {portfolioProjects.length < 10 && (
              <button
                type="button"
                onClick={handleAddProject}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition"
              >
                + Add Project
              </button>
            )}
          </div>

          <div className="space-y-6">
            {portfolioProjects.map((project, index) => (
              <div
                key={project.id || index}
                className="rounded-2xl border border-zinc-200 bg-zinc-50/50 p-5 dark:border-zinc-800 dark:bg-zinc-900/60 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">
                    Project #{index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveProject(index)}
                    className="text-xs font-bold text-red-500 hover:text-red-700 transition"
                  >
                    Delete Project
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                      Project Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={project.title}
                      onChange={(e) => handleUpdateProject(index, "title", e.target.value)}
                      placeholder="e.g. Real-Time Analytics Dashboard"
                      required
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                      Project URL / Live Demo
                    </label>
                    <input
                      type="url"
                      value={project.projectUrl || ""}
                      onChange={(e) => handleUpdateProject(index, "projectUrl", e.target.value)}
                      placeholder="https://example.com or GitHub repo"
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                      Image URL (Thumbnail)
                    </label>
                    <input
                      type="url"
                      value={project.imageUrl || ""}
                      onChange={(e) => handleUpdateProject(index, "imageUrl", e.target.value)}
                      placeholder="https://example.com/thumbnail.png"
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                      Skills Used (Comma-separated)
                    </label>
                    <input
                      type="text"
                      value={(project.skills || []).join(", ")}
                      onChange={(e) =>
                        handleUpdateProject(
                          index,
                          "skills",
                          e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean)
                        )
                      }
                      placeholder="e.g. Next.js, Prisma, Tailwind CSS"
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                    Project Description & Solution
                  </label>
                  <textarea
                    rows={3}
                    value={project.description || ""}
                    onChange={(e) => handleUpdateProject(index, "description", e.target.value)}
                    placeholder="Describe what this project achieves, architecture decisions, and client metrics..."
                    className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                  />
                </div>
              </div>
            ))}

            {portfolioProjects.length === 0 && (
              <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-center dark:border-zinc-800">
                <p className="text-xs text-zinc-400">
                  No detailed portfolio projects added yet. Click &quot;+ Add Project&quot; to showcase your best work.
                </p>
              </div>
            )}
          </div>

          {/* Fallback Simple Portfolio URLs */}
          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">
                Additional Web & GitHub Links
              </label>
              {portfolioUrls.length < 10 && (
                <button
                  type="button"
                  onClick={handleAddPortfolioField}
                  className="text-xs font-bold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
                >
                  + Add Link
                </button>
              )}
            </div>
            <div className="space-y-2">
              {portfolioUrls.map((url, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => handlePortfolioChange(index, e.target.value)}
                    placeholder="https://github.com/your-username or https://your-portfolio.com"
                    className="flex-1 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
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
            </div>
          </div>
        </div>

        {/* Section 5: Employment History */}
        <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <div>
              <h2 className="text-base font-bold text-zinc-950 dark:text-white">
                Employment History ({employmentHistory.length}/15)
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Detail your previous employment, client roles, and professional engineering positions.
              </p>
            </div>
            {employmentHistory.length < 15 && (
              <button
                type="button"
                onClick={handleAddEmployment}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition"
              >
                + Add Experience
              </button>
            )}
          </div>

          <div className="space-y-6">
            {employmentHistory.map((item, index) => (
              <div
                key={item.id || index}
                className="rounded-2xl border border-zinc-200 bg-zinc-50/50 p-5 dark:border-zinc-800 dark:bg-zinc-900/60 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">
                    Role #{index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveEmployment(index)}
                    className="text-xs font-bold text-red-500 hover:text-red-700 transition"
                  >
                    Delete Role
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                      Company Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={item.company}
                      onChange={(e) => handleUpdateEmployment(index, "company", e.target.value)}
                      placeholder="e.g. Acme Software Inc."
                      required
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                      Job Title / Position <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={item.position}
                      onChange={(e) => handleUpdateEmployment(index, "position", e.target.value)}
                      placeholder="e.g. Lead Frontend Engineer"
                      required
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                      Location
                    </label>
                    <input
                      type="text"
                      value={item.location || ""}
                      onChange={(e) => handleUpdateEmployment(index, "location", e.target.value)}
                      placeholder="e.g. Remote or Austin, TX"
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                      Start Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={item.startDate}
                      onChange={(e) => handleUpdateEmployment(index, "startDate", e.target.value)}
                      placeholder="e.g. Jan 2021"
                      required
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                      End Date
                    </label>
                    <input
                      type="text"
                      disabled={item.current}
                      value={item.current ? "Present" : item.endDate || ""}
                      onChange={(e) => handleUpdateEmployment(index, "endDate", e.target.value)}
                      placeholder="e.g. Dec 2023"
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none disabled:bg-zinc-100 disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:disabled:bg-zinc-900"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`current-job-${index}`}
                    checked={item.current || false}
                    onChange={(e) => handleUpdateEmployment(index, "current", e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor={`current-job-${index}`} className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    I currently work in this role
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                    Role Description & Key Achievements
                  </label>
                  <textarea
                    rows={3}
                    value={item.description || ""}
                    onChange={(e) => handleUpdateEmployment(index, "description", e.target.value)}
                    placeholder="Led architecture of core web application, improved performance by 40%, collaborated with cross-functional product teams..."
                    className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                  />
                </div>
              </div>
            ))}

            {employmentHistory.length === 0 && (
              <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-center dark:border-zinc-800">
                <p className="text-xs text-zinc-400">
                  No employment history added yet. Click &quot;+ Add Experience&quot; to highlight your past roles.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Section 6: Education History */}
        <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <div>
              <h2 className="text-base font-bold text-zinc-950 dark:text-white">
                Education ({educationHistory.length}/10)
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Add your academic background, university degrees, or technical bootcamps.
              </p>
            </div>
            {educationHistory.length < 10 && (
              <button
                type="button"
                onClick={handleAddEducation}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition"
              >
                + Add Education
              </button>
            )}
          </div>

          <div className="space-y-6">
            {educationHistory.map((item, index) => (
              <div
                key={item.id || index}
                className="rounded-2xl border border-zinc-200 bg-zinc-50/50 p-5 dark:border-zinc-800 dark:bg-zinc-900/60 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">
                    Degree #{index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveEducation(index)}
                    className="text-xs font-bold text-red-500 hover:text-red-700 transition"
                  >
                    Delete Education
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                      School / University <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={item.institution}
                      onChange={(e) => handleUpdateEducation(index, "institution", e.target.value)}
                      placeholder="e.g. Stanford University or MIT"
                      required
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                      Degree
                    </label>
                    <input
                      type="text"
                      value={item.degree || ""}
                      onChange={(e) => handleUpdateEducation(index, "degree", e.target.value)}
                      placeholder="e.g. Bachelor of Science"
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                      Field of Study
                    </label>
                    <input
                      type="text"
                      value={item.fieldOfStudy || ""}
                      onChange={(e) => handleUpdateEducation(index, "fieldOfStudy", e.target.value)}
                      placeholder="e.g. Computer Science"
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                      Start Year
                    </label>
                    <input
                      type="text"
                      value={item.startYear || ""}
                      onChange={(e) => handleUpdateEducation(index, "startYear", e.target.value)}
                      placeholder="e.g. 2016"
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                      Graduation Year
                    </label>
                    <input
                      type="text"
                      value={item.endYear || ""}
                      onChange={(e) => handleUpdateEducation(index, "endYear", e.target.value)}
                      placeholder="e.g. 2020"
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            ))}

            {educationHistory.length === 0 && (
              <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-center dark:border-zinc-800">
                <p className="text-xs text-zinc-400">
                  No education history added yet. Click &quot;+ Add Education&quot; to list your degree.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Section 7: Certifications & Credentials */}
        <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <div>
              <h2 className="text-base font-bold text-zinc-950 dark:text-white">
                Certifications & Credentials ({certifications.length}/10)
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Add industry certifications, verified badges, and licenses from providers like AWS, Google, or Microsoft.
              </p>
            </div>
            {certifications.length < 10 && (
              <button
                type="button"
                onClick={handleAddCertification}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition"
              >
                + Add Certification
              </button>
            )}
          </div>

          <div className="space-y-6">
            {certifications.map((item, index) => (
              <div
                key={item.id || index}
                className="rounded-2xl border border-zinc-200 bg-zinc-50/50 p-5 dark:border-zinc-800 dark:bg-zinc-900/60 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">
                    Credential #{index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCertification(index)}
                    className="text-xs font-bold text-red-500 hover:text-red-700 transition"
                  >
                    Delete Credential
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                      Certification Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => handleUpdateCertification(index, "name", e.target.value)}
                      placeholder="e.g. AWS Certified Solutions Architect"
                      required
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                      Issuing Organization <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={item.issuer}
                      onChange={(e) => handleUpdateCertification(index, "issuer", e.target.value)}
                      placeholder="e.g. Amazon Web Services"
                      required
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                      Issue Date
                    </label>
                    <input
                      type="text"
                      value={item.issueDate || ""}
                      onChange={(e) => handleUpdateCertification(index, "issueDate", e.target.value)}
                      placeholder="e.g. May 2023"
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                      Credential ID / License #
                    </label>
                    <input
                      type="text"
                      value={item.credentialId || ""}
                      onChange={(e) => handleUpdateCertification(index, "credentialId", e.target.value)}
                      placeholder="e.g. AWS-PSA-123456"
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                    Verification / Credential URL
                  </label>
                  <input
                    type="url"
                    value={item.credentialUrl || ""}
                    onChange={(e) => handleUpdateCertification(index, "credentialUrl", e.target.value)}
                    placeholder="https://www.credly.com/badges/..."
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                  />
                </div>
              </div>
            ))}

            {certifications.length === 0 && (
              <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-center dark:border-zinc-800">
                <p className="text-xs text-zinc-400">
                  No certifications added yet. Click &quot;+ Add Certification&quot; to showcase your credentials.
                </p>
              </div>
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
