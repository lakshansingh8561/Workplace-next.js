import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJobAction } from "./job";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, verifyUserForAction } from "@/lib/session";
import { resetRateLimits } from "@/lib/rate-limit";

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
  verifyUserForAction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    job: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    review: {
      aggregate: vi.fn(),
    },
    contract: {
      count: vi.fn(),
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Job Publishing Action (Fixed & Hourly)", () => {
  const verifiedClient = {
    id: "client_pub_12345",
    name: "Enterprise Client",
    email: "client@enterprise.com",
    role: "CLIENT",
    roleSelected: true,
    emailVerified: new Date(),
    sessionVersion: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();

    vi.mocked(verifyUserForAction).mockResolvedValue({
      success: true,
      user: verifiedClient as any,
    });
  });

  it("successfully publishes a FIXED-price job with valid budget", async () => {
    vi.mocked(prisma.job.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.job.create).mockResolvedValue({
      id: "job_fixed_9988",
      title: "Senior Next.js 16 Full-Stack Engineer",
      category: "Development & IT",
      createdAt: new Date(),
    } as any);

    const result = await createJobAction({
      title: "Senior Next.js 16 Full-Stack Engineer",
      category: "Development & IT",
      description: "We are seeking a senior engineer to optimize our full-stack marketplace application.",
      skills: ["Next.js", "TypeScript", "Tailwind CSS"],
      type: "FIXED",
      budget: 2500,
      duration: "1 to 3 months",
      experienceLevel: "EXPERT",
      status: "OPEN",
    });

    expect(result.success).toBe(true);
    expect(result.jobId).toBe("job_fixed_9988");
    expect(prisma.job.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Senior Next.js 16 Full-Stack Engineer",
          type: "FIXED",
          budget: 2500,
          hourlyMin: null,
          hourlyMax: null,
          status: "OPEN",
          clientId: verifiedClient.id,
        }),
      })
    );
  });

  it("successfully publishes an HOURLY job with valid min and max rates", async () => {
    vi.mocked(prisma.job.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.job.create).mockResolvedValue({
      id: "job_hourly_4455",
      title: "Cloud Infrastructure Architect",
      category: "Development & IT",
      createdAt: new Date(),
    } as any);

    const result = await createJobAction({
      title: "Cloud Infrastructure Architect",
      category: "Development & IT",
      description: "Architect high-availability Kubernetes clusters with automated canary rollouts.",
      skills: ["Kubernetes", "AWS", "Terraform"],
      type: "HOURLY",
      hourlyMin: 65,
      hourlyMax: 95,
      duration: "3 to 6 months",
      experienceLevel: "EXPERT",
      status: "OPEN",
    });

    expect(result.success).toBe(true);
    expect(result.jobId).toBe("job_hourly_4455");
    expect(prisma.job.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Cloud Infrastructure Architect",
          type: "HOURLY",
          budget: null,
          hourlyMin: 65,
          hourlyMax: 95,
          status: "OPEN",
          clientId: verifiedClient.id,
        }),
      })
    );
  });

  it("successfully saves a DRAFT job", async () => {
    vi.mocked(prisma.job.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.job.create).mockResolvedValue({
      id: "job_draft_1122",
      title: "Draft Mobile App Design",
      category: "Design & Creative",
      createdAt: new Date(),
    } as any);

    const result = await createJobAction({
      title: "Draft Mobile App Design",
      category: "Design & Creative",
      description: "Drafting the initial UI concepts for iOS and Android freelance companion apps.",
      skills: ["Figma", "UI/UX"],
      type: "FIXED",
      budget: 800,
      duration: "Less than 1 month",
      experienceLevel: "INTERMEDIATE",
      status: "DRAFT",
    });

    expect(result.success).toBe(true);
    expect(result.jobId).toBe("job_draft_1122");
    expect(prisma.job.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DRAFT",
        }),
      })
    );
  });

  it("detects and rejects duplicate job postings within 10 minutes", async () => {
    vi.mocked(prisma.job.findFirst).mockResolvedValue({
      id: "job_existing_123",
    } as any);

    const result = await createJobAction({
      title: "Senior Next.js 16 Full-Stack Engineer",
      category: "Development & IT",
      description: "We are seeking a senior engineer to optimize our full-stack marketplace application.",
      skills: ["Next.js", "TypeScript"],
      type: "FIXED",
      budget: 2500,
      duration: "1 to 3 months",
      experienceLevel: "EXPERT",
      status: "OPEN",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("already published recently");
    expect(prisma.job.create).not.toHaveBeenCalled();
  });

  it("validates that hourlyMin cannot exceed hourlyMax", async () => {
    const result = await createJobAction({
      title: "Invalid Rate Job",
      category: "Development & IT",
      description: "This posting contains hourlyMin greater than hourlyMax to test validation.",
      skills: ["React"],
      type: "HOURLY",
      hourlyMin: 100,
      hourlyMax: 50,
      duration: "1 to 3 months",
      experienceLevel: "INTERMEDIATE",
      status: "OPEN",
    });

    expect(result.success).toBe(false);
    expect(result.fieldErrors?.hourlyMin).toBeDefined();
    expect(prisma.job.create).not.toHaveBeenCalled();
  });

  it("validates that fixed price job must have a budget >= 5", async () => {
    const result = await createJobAction({
      title: "Underbudget Fixed Job",
      category: "Development & IT",
      description: "Testing underbudget constraint enforcement for fixed price projects.",
      skills: ["React"],
      type: "FIXED",
      budget: 2,
      duration: "1 to 3 months",
      experienceLevel: "INTERMEDIATE",
      status: "OPEN",
    });

    expect(result.success).toBe(false);
    expect(result.fieldErrors?.budget).toBeDefined();
    expect(prisma.job.create).not.toHaveBeenCalled();
  });
});
