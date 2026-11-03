/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/actions/marketplace-discovery-profiles.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getDeterministicAvatar,
  getInitials,
  CLIENT_DEMO_IMAGES,
  FREELANCER_DEMO_IMAGES,
} from "@/lib/avatar-map";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  getOrCreateConversationForContractAction,
  getOrCreatePreHireConversationAction,
  getMyConversationsAction,
} from "./message";
import { searchClientsAction } from "./client-discovery";
import { searchFreelancersAction } from "./freelancer-discovery";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/session", () => {
  const getCurrentUser = vi.fn();
  return {
    getCurrentUser,
    requireUser: vi.fn(async () => {
      const u = await getCurrentUser();
      if (!u) throw new Error("Unauthorized");
      return u;
    }),
    verifyUserForAction: vi.fn(async (allowed?: string | string[]) => {
      const user = await getCurrentUser();
      if (!user) {
        return {
          success: false,
          error: "Authentication required",
          code: "UNAUTHENTICATED",
        };
      }
      if (allowed) {
        const list = Array.isArray(allowed) ? allowed : [allowed];
        if (!list.includes(user.role)) {
          return {
            success: false,
            error: "Unauthorized role",
            code: "UNAUTHORIZED_ROLE",
          };
        }
      }
      return { success: true, user };
    }),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    job: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    contract: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    conversation: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    review: {
      groupBy: vi.fn(),
      aggregate: vi.fn(),
    },
  },
}));

describe("WorkPulse Integrated Marketplace: Avatar Mapping, Discovery & Messaging Resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Part 1: Strict Role-Segregated Deterministic Avatar Mapping", () => {
    it("strictly isolates client images and freelancer images", () => {
      CLIENT_DEMO_IMAGES.forEach((img) => {
        expect(img).toMatch(/^\/images\/client\/client[1-5]\.jfif$/);
        expect(img).not.toContain("freelancer");
      });

      FREELANCER_DEMO_IMAGES.forEach((img) => {
        expect(img).toMatch(/^\/images\/freelancers\/freelancer[1-5]\.(jpg|jfif)$/);
        expect(img).not.toContain("client");
      });
    });

    it("maps clients ONLY to client images and freelancers ONLY to freelancer images", () => {
      const clientAvatar = getDeterministicAvatar({ id: "client-123", role: "CLIENT" }, "CLIENT");
      expect(CLIENT_DEMO_IMAGES).toContain(clientAvatar);
      expect(FREELANCER_DEMO_IMAGES).not.toContain(clientAvatar);

      const freelancerAvatar = getDeterministicAvatar({ id: "freelancer-456", role: "FREELANCER" }, "FREELANCER");
      expect(FREELANCER_DEMO_IMAGES).toContain(freelancerAvatar);
      expect(CLIENT_DEMO_IMAGES).not.toContain(freelancerAvatar);
    });

    it("guarantees deterministic, idempotent photo assignment for the same ID", () => {
      const firstRun = getDeterministicAvatar({ id: "user-alpha-99", role: "FREELANCER" });
      const secondRun = getDeterministicAvatar({ id: "user-alpha-99", role: "FREELANCER" });
      const thirdRun = getDeterministicAvatar({ id: "user-alpha-99", role: "FREELANCER" });

      expect(firstRun).toBe(secondRun);
      expect(secondRun).toBe(thirdRun);
    });

    it("gives real uploaded profile images (e.g. Cloudinary) strict precedence", () => {
      const uploadedUrl = "https://res.cloudinary.com/workpulse/image/upload/v12345/avatar.jpg";
      const resolved = getDeterministicAvatar({
        id: "user-with-uploaded-photo",
        role: "FREELANCER",
        image: uploadedUrl,
      });

      expect(resolved).toBe(uploadedUrl);
    });

    it("computes clean initials fallback for users without photos", () => {
      expect(getInitials("Sarah Connor")).toBe("SC");
      expect(getInitials("Alex")).toBe("A");
      expect(getInitials("")).toBe("WP");
      expect(getInitials(null)).toBe("WP");
    });
  });

  describe("Part 2: Messaging Problem & Contract Resolution", () => {
    const mockClient = {
      id: "67a000000000000000000001",
      name: "Acme Corp",
      role: "CLIENT",
      emailVerified: new Date(),
    };

    const mockFreelancer = {
      id: "67a000000000000000000002",
      name: "Dev Dave",
      role: "FREELANCER",
      emailVerified: new Date(),
    };

    const mockContractId = "67a000000000000000000010";
    const mockJobId = "67a000000000000000000020";

    it("resolves an existing conversation when contractId is passed", async () => {
      (getCurrentUser as any).mockResolvedValue(mockClient);

      (prisma.contract.findUnique as any).mockResolvedValue({
        id: mockContractId,
        jobId: mockJobId,
        clientId: mockClient.id,
        freelancerId: mockFreelancer.id,
        status: "ACTIVE",
      });

      (prisma.conversation.findUnique as any).mockResolvedValue({
        id: "conv-existing-1",
      });

      const res = await getOrCreateConversationForContractAction(mockContractId);

      expect(res.success).toBe(true);
      expect(res.conversationId).toBe("conv-existing-1");
    });

    it("safely upgrades a pre-hire conversation to CONTRACT when contractId is resolved", async () => {
      (getCurrentUser as any).mockResolvedValue(mockClient);

      (prisma.contract.findUnique as any).mockResolvedValue({
        id: mockContractId,
        jobId: mockJobId,
        clientId: mockClient.id,
        freelancerId: mockFreelancer.id,
        status: "ACTIVE",
      });

      // 1. Not found by contractId
      // 2. Found by jobId_freelancerId
      (prisma.conversation.findUnique as any)
        .mockResolvedValueOnce(null) // by contractId
        .mockResolvedValueOnce({ id: "conv-prehire-1", contractId: null }); // by jobId_freelancerId

      (prisma.conversation.update as any).mockResolvedValue({
        id: "conv-prehire-1",
      });

      const res = await getOrCreateConversationForContractAction(mockContractId);

      expect(res.success).toBe(true);
      expect(res.conversationId).toBe("conv-prehire-1");
      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "conv-prehire-1" },
          data: { contractId: mockContractId, type: "CONTRACT" },
        })
      );
    });

    it("rejects unauthorized users attempting to access a contract conversation", async () => {
      const unauthorizedStranger = {
        id: "67a000000000000000000099",
        name: "Intruder",
        role: "CLIENT",
        emailVerified: new Date(),
      };
      (getCurrentUser as any).mockResolvedValue(unauthorizedStranger);

      (prisma.contract.findUnique as any).mockResolvedValue({
        id: mockContractId,
        jobId: mockJobId,
        clientId: mockClient.id,
        freelancerId: mockFreelancer.id,
        status: "ACTIVE",
      });

      const res = await getOrCreateConversationForContractAction(mockContractId);

      expect(res.success).toBe(false);
      expect(res.error).toContain("Forbidden");
    });

    it("getMyConversationsAction auto-syncs contracts missing conversations and returns valid list", async () => {
      (getCurrentUser as any).mockResolvedValue(mockClient);

      // No orphan contracts
      (prisma.contract.findFirst as any).mockResolvedValue(null);
      (prisma.conversation.count as any).mockResolvedValue(1);
      (prisma.conversation.findMany as any).mockResolvedValue([
        {
          id: "conv-100",
          type: "CONTRACT",
          contractId: mockContractId,
          jobId: mockJobId,
          clientId: mockClient.id,
          freelancerId: mockFreelancer.id,
          lastMessageAt: new Date(),
          contract: { id: mockContractId, title: "Website Build", status: "ACTIVE" },
          job: { id: mockJobId, title: "Website Build", status: "CLOSED" },
          interviewInvitation: null,
          client: mockClient,
          freelancer: mockFreelancer,
          messages: [{ content: "Kickoff tomorrow", createdAt: new Date() }],
        },
      ]);
      (prisma.message.groupBy as any).mockResolvedValue([]);

      const res = await getMyConversationsAction();

      expect(res.success).toBe(true);
      expect(res.conversations).toHaveLength(1);
      expect(res.conversations?.[0].counterparty.name).toBe("Dev Dave");
      expect(res.conversations?.[0].contractId).toBe(mockContractId);
    });

    it("creates a new contract conversation when contract exists without one", async () => {
      (getCurrentUser as any).mockResolvedValue(mockFreelancer);

      (prisma.contract.findUnique as any).mockResolvedValue({
        id: mockContractId,
        jobId: mockJobId,
        clientId: mockClient.id,
        freelancerId: mockFreelancer.id,
        status: "ACTIVE",
      });

      // Not found by contractId, and not found by (jobId, freelancerId)
      (prisma.conversation.findUnique as any)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      (prisma.conversation.create as any).mockResolvedValue({
        id: "conv-brand-new-contract",
      });

      const res = await getOrCreateConversationForContractAction(mockContractId);

      expect(res.success).toBe(true);
      expect(res.conversationId).toBe("conv-brand-new-contract");
      expect(prisma.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contractId: mockContractId,
            type: "CONTRACT",
            clientId: mockClient.id,
            freelancerId: mockFreelancer.id,
          }),
        })
      );
    });

    it("allows a client to initiate pre-hire conversation with a freelancer", async () => {
      (getCurrentUser as any).mockResolvedValue(mockClient);

      (prisma.job.findUnique as any).mockResolvedValue({
        id: mockJobId,
        clientId: mockClient.id,
        status: "OPEN",
      });

      (prisma.user.findUnique as any).mockResolvedValue({
        id: mockFreelancer.id,
        role: "FREELANCER",
        roleSelected: true,
      });

      (prisma.conversation.findUnique as any).mockResolvedValue(null);
      (prisma.conversation.create as any).mockResolvedValue({
        id: "conv-prehire-created",
      });

      const res = await getOrCreatePreHireConversationAction(mockJobId, mockFreelancer.id);

      expect(res.success).toBe(true);
      expect(res.conversationId).toBe("conv-prehire-created");
    });

    it("allows a freelancer to initiate pre-hire conversation with the client of an open job", async () => {
      (getCurrentUser as any).mockResolvedValue(mockFreelancer);

      (prisma.job.findUnique as any).mockResolvedValue({
        id: mockJobId,
        clientId: mockClient.id,
        status: "OPEN",
      });

      (prisma.user.findUnique as any).mockResolvedValue({
        id: mockClient.id,
        role: "CLIENT",
        roleSelected: true,
      });

      (prisma.conversation.findUnique as any).mockResolvedValue(null);
      (prisma.conversation.create as any).mockResolvedValue({
        id: "conv-prehire-from-freelancer",
      });

      const res = await getOrCreatePreHireConversationAction(mockJobId, mockClient.id);

      expect(res.success).toBe(true);
      expect(res.conversationId).toBe("conv-prehire-from-freelancer");
      expect(prisma.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "PRE_HIRE",
            jobId: mockJobId,
            clientId: mockClient.id,
            freelancerId: mockFreelancer.id,
          }),
        })
      );
    });
  });

  describe("Part 3: Client Discovery for Freelancers", () => {
    it("searches clients and excludes private contact/auth data", async () => {
      const mockRawClients = [
        {
          id: "client-1",
          name: "Acme Innovations",
          companyName: "Acme Corp",
          companyDescription: "Leading AI solutions provider",
          companyIndustry: "AI Services & ML",
          companyWebsite: "https://acme.example.com",
          location: "San Francisco, CA",
          image: null,
          createdAt: new Date("2026-01-01"),
          _count: { jobs: 5 },
        },
      ];

      (prisma.user.findMany as any)
        .mockResolvedValueOnce(mockRawClients)
        .mockResolvedValueOnce([{ companyIndustry: "AI Services & ML" }]);
      (prisma.user.count as any).mockResolvedValue(1);
      (prisma.job.groupBy as any).mockResolvedValue([{ clientId: "client-1", _count: { _all: 3 } }]);

      const res = await searchClientsAction({ query: "Acme", sort: "jobs_desc" });

      expect(res.success).toBe(true);
      expect(res.clients).toHaveLength(1);
      const c = res.clients[0];
      expect(c.companyName).toBe("Acme Corp");
      expect(c.openJobsCount).toBe(3);
      expect(c.totalJobsCount).toBe(5);
      expect(c.image).toMatch(/^\/images\/client\/client[1-5]\.jfif$/);
      // Ensure email/password are not leaked
      expect((c as any).email).toBeUndefined();
      expect((c as any).passwordHash).toBeUndefined();
    });
  });

  describe("Part 4: Freelancer Discovery for Clients", () => {
    it("searches freelancers with skills, rates, and verified reviews", async () => {
      const mockRawFreelancers = [
        {
          id: "fl-1",
          name: "Jane Doe",
          image: null,
          title: "Full-Stack Next.js Architect",
          bio: "Senior engineer specializing in Next.js, React 19, and Tailwind CSS.",
          skills: ["React", "Next.js", "TypeScript"],
          hourlyRate: 85,
          experience: "5+ years",
          location: "Austin, TX",
          portfolioUrls: ["https://janedoe.dev"],
          createdAt: new Date("2026-01-01"),
          _count: { freelancerContracts: 8, reviewsReceived: 6 },
        },
      ];

      (prisma.user.findMany as any)
        .mockResolvedValueOnce(mockRawFreelancers)
        .mockResolvedValueOnce([{ skills: ["React", "Next.js", "TypeScript"] }]);
      (prisma.user.count as any).mockResolvedValue(1);
      (prisma.review.groupBy as any).mockResolvedValue([
        { revieweeId: "fl-1", _avg: { rating: 4.9 }, _count: { _all: 6 } },
      ]);

      const res = await searchFreelancersAction({
        query: "Next.js",
        skill: "React",
        minRate: 50,
        maxRate: 100,
        sort: "rating",
      });

      expect(res.success).toBe(true);
      expect(res.freelancers).toHaveLength(1);
      const f = res.freelancers[0];
      expect(f.name).toBe("Jane Doe");
      expect(f.hourlyRate).toBe(85);
      expect(f.averageRating).toBe(4.9);
      expect(f.completedContractsCount).toBe(8);
      expect(f.image).toMatch(/^\/images\/freelancers\/freelancer[1-5]\.(jpg|jfif)$/);
      // Ensure email/password are not leaked
      expect((f as any).email).toBeUndefined();
      expect((f as any).passwordHash).toBeUndefined();
    });
  });
});

