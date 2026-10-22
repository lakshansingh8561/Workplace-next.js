/**
 * Core domain types for the Upwork-inspired freelance marketplace.
 * These types establish a scalable contract for jobs, freelancers, and clients.
 */

export type UserRole = "client" | "freelancer";

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: UserRole;
  createdAt: string;
}

export type JobType = "hourly" | "fixed";
export type JobStatus = "draft" | "open" | "in_progress" | "completed" | "closed";
export type ExperienceLevel = "entry" | "intermediate" | "expert";

export interface Job {
  id: string;
  title: string;
  description: string;
  category: string;
  skills: string[];
  type: "HOURLY" | "FIXED" | JobType;
  budget?: number | null;
  hourlyMin?: number | null;
  hourlyMax?: number | null;
  hourlyRate?: {
    min: number;
    max: number;
  };
  duration?: string | null;
  experienceLevel: "ENTRY" | "INTERMEDIATE" | "EXPERT" | ExperienceLevel;
  clientId?: string;
  status: "OPEN" | "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CLOSED" | JobStatus;
  proposalsCount: number;
  clientName?: string | null;
  clientCountry?: string | null;
  clientRating?: number | null;
  clientSpent?: number | null;
  clientPaymentVerified?: boolean;
  createdAt: string | Date;
  updatedAt?: string | Date;
  legacyId?: string;
}

export interface JobPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface JobsApiResponse {
  data: Job[];
  pagination: JobPagination;
  error?: string;
}

export interface JobApiResponse {
  data?: Job;
  error?: string;
}

export interface FreelancerProfile {
  id: string;
  userId: string;
  title: string;
  bio: string;
  hourlyRate: number;
  skills: string[];
  rating: number;
  totalEarnings?: number;
  completedJobsCount: number;
  isAvailable: boolean;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string;
  jobCount: number;
  description?: string;
  skills?: string[];
}

export interface PlatformMetric {
  label: string;
  value: string;
  description?: string;
}

export interface ValueProposition {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export interface HowItWorksStep {
  step: string;
  title: string;
  description: string;
  forRole: "client" | "freelancer";
}
