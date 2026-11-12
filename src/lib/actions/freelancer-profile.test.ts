/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  updateFreelancerProfileAction,
  getFreelancerPublicProfile,
} from "./profile";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      update: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe("Phase 5: Freelancer Professional Profiles & Portfolios Server Actions", () => {
  const mockFreelancerUser = {
    id: "678901234567890123456789",
    name: "Alex Morgan",
    email: "alex@example.com",
    role: "FREELANCER",
  };

  const mockClientUser = {
    id: "123456789012345678901234",
    name: "Client Boss",
    email: "client@example.com",
    role: "CLIENT",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("updateFreelancerProfileAction - Authentication & Authorization", () => {
    it("rejects unauthenticated requests", async () => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

      const result = await updateFreelancerProfileAction({ name: "Alex" });

      expect(result.success).toBe(false);
      expect(result.error).toBe("You must be signed in to update your profile.");
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("rejects unauthorized client accounts attempting to update freelancer profile", async () => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce(mockClientUser as any);

      const result = await updateFreelancerProfileAction({ name: "Client Impostor" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Only freelancer accounts can update freelancer profiles");
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("prevents cross-user modification: always updates the authenticated session user ID only", async () => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce(mockFreelancerUser as any);

      vi.mocked(prisma.user.update).mockResolvedValueOnce({
        id: mockFreelancerUser.id,
        name: "Alex Morgan",
        role: "FREELANCER",
        title: "Senior Dev",
        bio: "Experienced developer",
        skills: ["React"],
        hourlyRate: 75,
        experience: "Expert",
        location: "NYC",
        languages: ["English"],
        portfolioUrls: [],
        isAvailable: true,
        visibility: "PUBLIC",
        portfolioProjects: [],
        employmentHistory: [],
        educationHistory: [],
        certifications: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      // Attempt to pass another user's id in the payload
      const payload = {
        id: "victim_user_id_999999999",
        userId: "victim_user_id_999999999",
        name: "Alex Morgan",
        title: "Senior Dev",
        bio: "Experienced developer",
        skills: ["React"],
        hourlyRate: 75,
      };

      const result = await updateFreelancerProfileAction(payload);

      expect(result.success).toBe(true);
      // Strictly verifies the where clause uses the verified session user's ID
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockFreelancerUser.id },
        })
      );
    });

    it("verifies Freelancer A cannot update Freelancer B's employment, education, certifications, portfolio, availability, or visibility", async () => {
      const freelancerA = {
        id: "freelancer_a_111111111111",
        name: "Freelancer Alice",
        email: "alice@example.com",
        role: "FREELANCER",
      };
      const freelancerBId = "freelancer_b_222222222222";

      vi.mocked(getCurrentUser).mockResolvedValueOnce(freelancerA as any);

      vi.mocked(prisma.user.update).mockResolvedValueOnce({
        id: freelancerA.id,
        name: "Freelancer Alice",
        role: "FREELANCER",
        title: "Malicious Actor Attempting Tampering",
        bio: "Valid overview",
        skills: ["Security"],
        hourlyRate: 100,
        experience: "Expert",
        location: "Remote",
        languages: ["English"],
        portfolioUrls: [],
        isAvailable: false,
        visibility: "PRIVATE",
        portfolioProjects: [],
        employmentHistory: [],
        educationHistory: [],
        certifications: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      // Freelancer A attempts to pass Freelancer B's ID to rewrite B's credentials and history
      const maliciousPayload = {
        targetUserId: freelancerBId,
        id: freelancerBId,
        userId: freelancerBId,
        name: "Compromised Freelancer B",
        title: "Compromised Title",
        bio: "Overwriting B's bio with defamatory content",
        isAvailable: false,
        visibility: "PRIVATE",
        portfolioProjects: [
          {
            title: "Fabricated Project",
            projectUrl: "https://fake.example.com",
            skills: ["Hacking"],
          },
        ],
        employmentHistory: [
          {
            company: "Fabricated Employer Inc",
            position: "Fake Executive",
            startDate: "2010",
            current: true,
          },
        ],
        educationHistory: [
          {
            institution: "Fabricated University",
            degree: "Ph.D.",
          },
        ],
        certifications: [
          {
            name: "Fabricated Credential",
            issuer: "Fake Issuer",
          },
        ],
      };

      const result = await updateFreelancerProfileAction(maliciousPayload);

      expect(result.success).toBe(true);
      // The update operation MUST target Freelancer A's ID, NEVER Freelancer B's ID
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: freelancerA.id },
        })
      );
      expect(prisma.user.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: freelancerBId },
        })
      );
    });
  });

  describe("updateFreelancerProfileAction - Validation & Persistence", () => {
    it("preserves backward compatibility when legacy payload contains only portfolioUrls without portfolioProjects", async () => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce(mockFreelancerUser as any);

      const legacyPayload = {
        name: "Alex Morgan",
        title: "Senior Dev",
        bio: "Long-standing developer on the platform.",
        skills: ["React", "JavaScript"],
        hourlyRate: 70,
        portfolioUrls: [
          "https://github.com/alexmorgan",
          "https://alexmorgan.dev",
        ],
      };

      vi.mocked(prisma.user.update).mockResolvedValueOnce({
        id: mockFreelancerUser.id,
        ...legacyPayload,
        experience: null,
        location: null,
        languages: [],
        isAvailable: true,
        visibility: "PUBLIC",
        portfolioProjects: [],
        employmentHistory: [],
        educationHistory: [],
        certifications: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await updateFreelancerProfileAction(legacyPayload);

      expect(result.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            portfolioUrls: [
              "https://github.com/alexmorgan",
              "https://alexmorgan.dev",
            ],
            portfolioProjects: [],
          }),
        })
      );
    });

    it("returns validation field errors when required fields are invalid", async () => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce(mockFreelancerUser as any);

      const result = await updateFreelancerProfileAction({
        name: "A", // too short (min 2)
        hourlyRate: -50, // negative not allowed
        skills: [""], // empty skill
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Please correct the errors");
      expect(result.fieldErrors).toBeDefined();
      expect(result.fieldErrors?.name).toBeDefined();
      expect(result.fieldErrors?.hourlyRate).toBeDefined();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("successfully persists Phase 5 portfolio projects, employment, education, certifications, availability and visibility", async () => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce(mockFreelancerUser as any);

      const inputPayload = {
        name: "Alex Morgan",
        title: "Staff Software Engineer",
        bio: "Building distributed web architectures with Next.js, Node.js, and MongoDB.",
        skills: ["Next.js", "TypeScript", "Prisma"],
        hourlyRate: 95,
        location: "San Francisco, CA",
        languages: ["English (Native)"],
        portfolioUrls: ["https://github.com/alexmorgan"],
        isAvailable: true,
        visibility: "PUBLIC",
        portfolioProjects: [
          {
            title: "Marketplace Engine",
            description: "High-concurrency freelance platform with MongoDB escrows.",
            projectUrl: "https://github.com/alexmorgan/marketplace",
            imageUrl: "https://example.com/project.png",
            skills: ["Next.js", "Prisma"],
          },
        ],
        employmentHistory: [
          {
            company: "Tech Giant Corp",
            position: "Senior Software Engineer",
            location: "San Francisco, CA",
            startDate: "Jan 2020",
            endDate: "Present",
            current: true,
            description: "Led the core platform engineering team.",
          },
        ],
        educationHistory: [
          {
            institution: "UC Berkeley",
            degree: "B.S. in Electrical Engineering & Computer Science",
            fieldOfStudy: "Computer Science",
            startYear: "2015",
            endYear: "2019",
          },
        ],
        certifications: [
          {
            name: "AWS Certified Solutions Architect",
            issuer: "Amazon Web Services",
            issueDate: "2023",
            credentialId: "AWS-12345",
            credentialUrl: "https://aws.amazon.com/verify/12345",
          },
        ],
      };

      vi.mocked(prisma.user.update).mockResolvedValueOnce({
        id: mockFreelancerUser.id,
        ...inputPayload,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await updateFreelancerProfileAction(inputPayload);

      expect(result.success).toBe(true);
      expect(result.profile).toBeDefined();
      expect(result.completion?.score).toBe(100);

      // Verify update arguments in Prisma call
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockFreelancerUser.id },
        data: expect.objectContaining({
          name: "Alex Morgan",
          isAvailable: true,
          visibility: "PUBLIC",
          portfolioProjects: expect.arrayContaining([
            expect.objectContaining({
              title: "Marketplace Engine",
              projectUrl: "https://github.com/alexmorgan/marketplace",
            }),
          ]),
          employmentHistory: expect.arrayContaining([
            expect.objectContaining({
              company: "Tech Giant Corp",
              current: true,
            }),
          ]),
          educationHistory: expect.arrayContaining([
            expect.objectContaining({
              institution: "UC Berkeley",
            }),
          ]),
          certifications: expect.arrayContaining([
            expect.objectContaining({
              name: "AWS Certified Solutions Architect",
            }),
          ]),
        }),
        select: expect.any(Object),
      });

      // Verify path revalidation occurred
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard/freelancer");
      expect(revalidatePath).toHaveBeenCalledWith("/profile/freelancer");
      expect(revalidatePath).toHaveBeenCalledWith(`/freelancers/${mockFreelancerUser.id}`);
      expect(revalidatePath).toHaveBeenCalledWith("/freelancers");
    });
  });

  describe("getFreelancerPublicProfile - Public and Private Profiles", () => {
    const targetUserId = "678901234567890123456789";

    it("returns null for malformed or invalid ObjectIds", async () => {
      const result = await getFreelancerPublicProfile("invalid-id-format");
      expect(result).toBeNull();
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it("returns null if freelancer does not exist", async () => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);

      const result = await getFreelancerPublicProfile(targetUserId);
      expect(result).toBeNull();
    });

    it("returns all Phase 5 details for a PUBLIC profile to any visitor", async () => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce(null); // anonymous viewer

      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
        id: targetUserId,
        name: "Alex Morgan",
        image: "/avatars/alex.png",
        role: "FREELANCER",
        title: "Full-Stack Specialist",
        bio: "Specializing in high performance web applications.",
        skills: ["Next.js", "TypeScript"],
        hourlyRate: 80,
        experience: "Expert",
        location: "Berlin, Germany",
        languages: ["English", "German"],
        portfolioUrls: ["https://github.com/alex"],
        isAvailable: true,
        visibility: "PUBLIC",
        portfolioProjects: [
          {
            id: "proj-1",
            title: "E-Commerce App",
            description: "Storefront built with React.",
            projectUrl: "https://store.example.com",
            imageUrl: "https://store.example.com/thumb.png",
            skills: ["React"],
          },
        ],
        employmentHistory: [
          {
            id: "emp-1",
            company: "WebStudio",
            position: "Developer",
            location: "Berlin",
            startDate: "2019",
            endDate: "2022",
            current: false,
            description: "Developed client web apps.",
          },
        ],
        educationHistory: [
          {
            id: "edu-1",
            institution: "TU Berlin",
            degree: "B.Sc.",
            fieldOfStudy: "Informatics",
            startYear: "2015",
            endYear: "2019",
            description: "Computer science degree.",
          },
        ],
        certifications: [
          {
            id: "cert-1",
            name: "GCP Cloud Architect",
            issuer: "Google Cloud",
            issueDate: "2023",
            expiryDate: "2026",
            credentialId: "GCP-999",
            credentialUrl: "https://google.com/cert/999",
          },
        ],
        createdAt: new Date("2024-01-01"),
        _count: { freelancerContracts: 5 },
      } as any);

      const result = await getFreelancerPublicProfile(targetUserId);

      expect(result).not.toBeNull();
      expect(result?.name).toBe("Alex Morgan");
      expect(result?.isAvailable).toBe(true);
      expect(result?.visibility).toBe("PUBLIC");
      expect(result?.portfolioProjects).toHaveLength(1);
      expect(result?.employmentHistory).toHaveLength(1);
      expect(result?.educationHistory).toHaveLength(1);
      expect(result?.certifications).toHaveLength(1);
      expect(result?._count?.freelancerContracts).toBe(5);
    });

    it("masks sensitive details when profile is PRIVATE and viewer is NOT the owner", async () => {
      // Viewer is another user (or client)
      vi.mocked(getCurrentUser).mockResolvedValueOnce({
        id: "different_viewer_id_11111",
        role: "CLIENT",
      } as any);

      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
        id: targetUserId,
        name: "Private Freelancer",
        image: "/avatars/private.png",
        role: "FREELANCER",
        title: "Confidential Developer",
        bio: "Secret bio that should be hidden from non-owners",
        skills: ["Secret Skill"],
        hourlyRate: 150,
        experience: "Expert",
        location: "London",
        languages: ["English"],
        portfolioUrls: ["https://secret.com"],
        isAvailable: true,
        visibility: "PRIVATE",
        portfolioProjects: [{ title: "Secret Project" }],
        employmentHistory: [{ company: "Secret Co" }],
        educationHistory: [{ institution: "Secret University" }],
        certifications: [{ name: "Secret Cert" }],
        createdAt: new Date("2024-01-01"),
        _count: { freelancerContracts: 10 },
      } as any);

      const result = await getFreelancerPublicProfile(targetUserId);

      expect(result).not.toBeNull();
      expect(result?.visibility).toBe("PRIVATE");
      // All sensitive details masked
      expect(result?.title).toBeNull();
      expect(result?.image).toBeNull();
      expect(result?.bio).toBeNull();
      expect(result?.skills).toEqual([]);
      expect(result?.hourlyRate).toBeNull();
      expect(result?.portfolioProjects).toEqual([]);
      expect(result?.employmentHistory).toEqual([]);
      expect(result?.educationHistory).toEqual([]);
      expect(result?.certifications).toEqual([]);
      expect(result?._count?.freelancerContracts).toBe(0);
    });

    it("allows the owner to view their own full profile even when visibility is PRIVATE", async () => {
      // Viewer IS the owner
      vi.mocked(getCurrentUser).mockResolvedValueOnce({
        id: targetUserId,
        role: "FREELANCER",
      } as any);

      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
        id: targetUserId,
        name: "Private Freelancer",
        image: "/avatars/private.png",
        role: "FREELANCER",
        title: "Confidential Developer",
        bio: "My secret bio",
        skills: ["React"],
        hourlyRate: 150,
        experience: "Expert",
        location: "London",
        languages: ["English"],
        portfolioUrls: [],
        isAvailable: true,
        visibility: "PRIVATE",
        portfolioProjects: [{ id: "p1", title: "Internal Tool", skills: [] }],
        employmentHistory: [{ id: "e1", company: "Internal Co", position: "Lead", current: true }],
        educationHistory: [],
        certifications: [],
        createdAt: new Date("2024-01-01"),
        _count: { freelancerContracts: 10 },
      } as any);

      const result = await getFreelancerPublicProfile(targetUserId);

      expect(result).not.toBeNull();
      expect(result?.visibility).toBe("PRIVATE");
      // Owner sees full data
      expect(result?.bio).toBe("My secret bio");
      expect(result?.skills).toEqual(["React"]);
      expect(result?.portfolioProjects).toHaveLength(1);
      expect(result?.employmentHistory).toHaveLength(1);
    });

    it("safely handles legacy MongoDB records where Phase 5 fields are null or undefined in database", async () => {
      vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

      // Legacy record created before Phase 5 existed
      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
        id: targetUserId,
        name: "Legacy Freelancer",
        image: null,
        role: "FREELANCER",
        title: "Senior Coder",
        bio: "Old bio",
        skills: ["C++"],
        hourlyRate: 60,
        experience: "Senior",
        location: "Toronto",
        languages: ["English"],
        portfolioUrls: ["https://legacy.dev"],
        // New fields missing/null in legacy MongoDB document
        isAvailable: null,
        visibility: null,
        portfolioProjects: null,
        employmentHistory: null,
        educationHistory: null,
        certifications: null,
        createdAt: new Date("2023-01-01"),
        _count: { freelancerContracts: 2 },
      } as any);

      const result = await getFreelancerPublicProfile(targetUserId);

      expect(result).not.toBeNull();
      // Applies fallback defaults
      expect(result?.isAvailable).toBe(true);
      expect(result?.visibility).toBe("PUBLIC");
      expect(result?.portfolioProjects).toEqual([]);
      expect(result?.employmentHistory).toEqual([]);
      expect(result?.educationHistory).toEqual([]);
      expect(result?.certifications).toEqual([]);
      expect(result?.portfolioUrls).toEqual(["https://legacy.dev"]);
    });
  });
});

