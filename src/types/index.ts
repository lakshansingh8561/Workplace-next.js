/**
 * Core domain types for the Upwork-inspired freelance marketplace.
 * These types establish a scalable contract for jobs, freelancers, and clients.
 */

export type UserRole = "client" | "freelancer";

export type Role = "CLIENT" | "FREELANCER";
export const Role = {
  CLIENT: "CLIENT",
  FREELANCER: "FREELANCER",
} as const;

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: UserRole;
  createdAt: string;
}

export type JobType = "hourly" | "fixed";
export type JobStatus = "draft" | "open" | "paused" | "in_progress" | "completed" | "closed";
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
  status: "OPEN" | "PAUSED" | "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CLOSED" | JobStatus;
  proposalsCount: number;
  clientName?: string | null;
  clientCountry?: string | null;
  clientRating?: number | null;
  clientSpent?: number | null;
  clientPaymentVerified?: boolean;
  client?: {
    id: string;
    name?: string | null;
    companyName?: string | null;
    companyDescription?: string | null;
    companyWebsite?: string | null;
    companyIndustry?: string | null;
    location?: string | null;
  } | null;
  createdAt: string | Date;
  updatedAt?: string | Date;
  legacyId?: string;
}

export interface SavedJobItem {
  id: string;
  userId: string;
  jobId: string;
  createdAt: string | Date;
  job: Job;
}

export interface JobPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface JobFilterFacets {
  categories: { category: string; count: number; skills?: string[] }[];
  skills: { skill: string; count: number }[];
  budgetBounds: { min: number; max: number };
}

export interface JobsApiResponse {
  data: Job[];
  pagination: JobPagination;
  facets?: JobFilterFacets;
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

export type ProposalStatus =
  | "PENDING"
  | "UNDER_REVIEW"
  | "SHORTLISTED"
  | "ACCEPTED"
  | "REJECTED"
  | "WITHDRAWN";

export type OfferStatus =
  | "PENDING"
  | "ACCEPTED"
  | "DECLINED"
  | "COUNTERED"
  | "WITHDRAWN"
  | "EXPIRED";

export type OfferType = "DIRECT_HIRE" | "PROPOSAL_NEGOTIATION";

export interface OfferMilestoneItem {
  title: string;
  description?: string | null;
  amount: number;
  dueDate?: string | null;
}

export interface NegotiationRoundItem {
  id: string;
  senderId: string;
  senderRole: "CLIENT" | "FREELANCER";
  amount: number;
  type: "FIXED" | "HOURLY";
  message?: string | null;
  createdAt: string | Date;
}

export interface HiringOfferItem {
  id: string;
  clientId: string;
  freelancerId: string;
  jobId?: string | null;
  proposalId?: string | null;
  contractId?: string | null;
  title: string;
  description: string;
  type: "FIXED" | "HOURLY";
  amount: number;
  duration?: string | null;
  startDate?: string | Date | null;
  milestones?: OfferMilestoneItem[];
  negotiationHistory?: NegotiationRoundItem[];
  status: OfferStatus;
  offerType: OfferType;
  lastActionBy?: string | null;
  message?: string | null;
  declineReason?: string | null;
  createdAt: string | Date;
  updatedAt?: string | Date;
  client?: {
    id: string;
    name?: string | null;
    image?: string | null;
    companyName?: string | null;
  };
  freelancer?: {
    id: string;
    name?: string | null;
    image?: string | null;
    title?: string | null;
  };
  job?: {
    id: string;
    title: string;
    status: string;
  } | null;
}

export interface Proposal {
  id: string;
  jobId: string;
  freelancerId: string;
  coverLetter: string;
  bidAmount: number;
  estimatedDuration?: string | null;
  status: ProposalStatus;
  createdAt: string | Date;
  updatedAt?: string | Date;
  freelancer?: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  job?: {
    id: string;
    title: string;
    type: string;
    budget?: number | null;
    hourlyMin?: number | null;
    hourlyMax?: number | null;
    clientId?: string | null;
  };
}

export type ContractStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "TERMINATED";
export type MilestoneStatus = "PENDING" | "ACTIVE" | "SUBMITTED" | "APPROVED";

export interface ContractMilestone {
  id: string;
  contractId: string;
  title: string;
  description?: string | null;
  amount: number;
  dueDate?: string | null;
  status: MilestoneStatus;
  createdAt: string | Date;
  updatedAt?: string | Date;
}

export interface Contract {
  id: string;
  proposalId: string;
  jobId: string;
  clientId: string;
  freelancerId: string;
  title: string;
  type: "HOURLY" | "FIXED" | JobType;
  totalAmount?: number | null;
  hourlyRate?: number | null;
  terms?: string | null;
  status: ContractStatus;
  startDate: string | Date;
  endDate?: string | Date | null;
  createdAt: string | Date;
  updatedAt?: string | Date;
  milestones?: ContractMilestone[];
  job?: {
    id: string;
    title: string;
    category: string;
    type: string;
  };
  client?: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  freelancer?: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

export type NotificationType =
  | "NEW_MESSAGE"
  | "MILESTONE_SUBMITTED"
  | "MILESTONE_APPROVED"
  | "CONTRACT_STATUS";

export interface NotificationItem {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  read: boolean;
  createdAt: string | Date;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  read: boolean;
  createdAt: string | Date;
  sender?: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
}

export type ConversationType = "PRE_HIRE" | "CONTRACT";
export type InvitationStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "WITHDRAWN" | "EXPIRED";

export interface ConversationItem {
  id: string;
  type?: ConversationType;
  contractId?: string | null;
  jobId?: string | null;
  clientId: string;
  freelancerId: string;
  lastMessageAt: string | Date;
  createdAt: string | Date;
  updatedAt: string | Date;
  unreadCount?: number;
  lastMessage?: string | null;
  contract?: {
    id: string;
    title: string;
    status: string;
  } | null;
  job?: {
    id: string;
    title: string;
    status: string;
  } | null;
  client: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
  freelancer: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
}

export interface PortfolioProjectItem {
  id: string;
  title: string;
  description?: string | null;
  projectUrl?: string | null;
  imageUrl?: string | null;
  skills: string[];
}

export interface EmploymentHistoryItem {
  id: string;
  company: string;
  position: string;
  location?: string | null;
  startDate: string;
  endDate?: string | null;
  current: boolean;
  description?: string | null;
}

export interface EducationHistoryItem {
  id: string;
  institution: string;
  degree?: string | null;
  fieldOfStudy?: string | null;
  startYear?: string | null;
  endYear?: string | null;
  description?: string | null;
}

export interface CertificationItem {
  id: string;
  name: string;
  issuer: string;
  issueDate?: string | null;
  expiryDate?: string | null;
  credentialId?: string | null;
  credentialUrl?: string | null;
}

export interface PublicFreelancerProfileData {
  id: string;
  name: string;
  image?: string | null;
  role: string;
  title?: string | null;
  bio?: string | null;
  skills: string[];
  hourlyRate?: number | null;
  experience?: string | null;
  location?: string | null;
  languages: string[];
  portfolioUrls: string[];
  isAvailable?: boolean;
  visibility?: "PUBLIC" | "PRIVATE" | string;
  portfolioProjects?: PortfolioProjectItem[];
  employmentHistory?: EmploymentHistoryItem[];
  educationHistory?: EducationHistoryItem[];
  certifications?: CertificationItem[];
  createdAt: string;
  _count?: {
    freelancerContracts: number;
  };
}
