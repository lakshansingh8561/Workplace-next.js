import { describe, it, expect } from "vitest";
import {
  PortfolioProjectSchema,
  EmploymentHistorySchema,
  EducationHistorySchema,
  CertificationSchema,
  FreelancerProfileSchema,
  calculateFreelancerProfileCompletion,
} from "./profile";

describe("Phase 5: Freelancer Profile & Portfolio Validations", () => {
  describe("PortfolioProjectSchema", () => {
    it("validates a complete, valid portfolio project", () => {
      const validProject = {
        title: "WorkPulse Freelance Platform",
        description: "Full-stack marketplace with real-time messaging and milestone escrows.",
        projectUrl: "https://github.com/example/workpulse",
        imageUrl: "https://images.example.com/screenshot1.png",
        skills: ["Next.js", "TypeScript", "Prisma", "Tailwind CSS"],
      };

      const result = PortfolioProjectSchema.safeParse(validProject);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("WorkPulse Freelance Platform");
        expect(result.data.skills).toHaveLength(4);
      }
    });

    it("rejects unsafe URLs in projectUrl and imageUrl", () => {
      const xssProject = {
        title: "Malicious Project",
        projectUrl: "javascript:alert(document.cookie)",
        imageUrl: "data:text/html,<script>alert(1)</script>",
        skills: ["Security"],
      };

      const result = PortfolioProjectSchema.safeParse(xssProject);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issues = result.error.issues;
        expect(issues.some((i) => i.path.includes("projectUrl"))).toBe(true);
        expect(issues.some((i) => i.path.includes("imageUrl"))).toBe(true);
      }
    });

    it("allows optional and empty string fields", () => {
      const minimalProject = {
        title: "Simple Project",
        description: "",
        projectUrl: "",
        imageUrl: "",
        skills: [],
      };

      const result = PortfolioProjectSchema.safeParse(minimalProject);
      expect(result.success).toBe(true);
    });

    it("rejects missing title or titles shorter than 2 characters", () => {
      const invalid = {
        title: "A",
        skills: [],
      };
      const result = PortfolioProjectSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("EmploymentHistorySchema", () => {
    it("validates a standard employment history record", () => {
      const record = {
        company: "Stripe",
        position: "Senior Full-Stack Engineer",
        location: "San Francisco, CA (Remote)",
        startDate: "Jan 2021",
        endDate: "Present",
        current: true,
        description: "Architected billing infrastructure and payment webhooks.",
      };

      const result = EmploymentHistorySchema.safeParse(record);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.current).toBe(true);
        expect(result.data.company).toBe("Stripe");
      }
    });

    it("requires company, position, and start date", () => {
      const missingFields = {
        company: "",
        position: "",
        startDate: "",
      };

      const result = EmploymentHistorySchema.safeParse(missingFields);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe("EducationHistorySchema", () => {
    it("validates an education entry", () => {
      const entry = {
        institution: "Stanford University",
        degree: "Bachelor of Science",
        fieldOfStudy: "Computer Science",
        startYear: "2016",
        endYear: "2020",
        description: "Graduated with Honors, focused on Distributed Systems.",
      };

      const result = EducationHistorySchema.safeParse(entry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.institution).toBe("Stanford University");
        expect(result.data.degree).toBe("Bachelor of Science");
      }
    });

    it("requires institution name", () => {
      const invalid = {
        institution: " ",
      };

      const result = EducationHistorySchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("CertificationSchema", () => {
    it("validates certification credentials with safe URLs", () => {
      const cert = {
        name: "AWS Certified Solutions Architect - Associate",
        issuer: "Amazon Web Services",
        issueDate: "May 2023",
        expiryDate: "May 2026",
        credentialId: "AWS-SAA-987654",
        credentialUrl: "https://www.credly.com/badges/sample-id",
      };

      const result = CertificationSchema.safeParse(cert);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.issuer).toBe("Amazon Web Services");
      }
    });

    it("rejects malicious or javascript: credential URLs", () => {
      const badCert = {
        name: "Certified Ethical Hacker",
        issuer: "EC-Council",
        credentialUrl: "javascript:exploit()",
      };

      const result = CertificationSchema.safeParse(badCert);
      expect(result.success).toBe(false);
    });
  });

  describe("FreelancerProfileSchema (Full Profile with Phase 5 Fields)", () => {
    it("validates full profile including availability, visibility, portfolios, employment, education, and certifications", () => {
      const fullProfile = {
        name: "Alex Morgan",
        title: "Lead Full-Stack Engineer",
        bio: "Over 8 years building scalable cloud applications and high-performance Web apps.",
        skills: ["React", "Next.js", "TypeScript", "Node.js"],
        hourlyRate: 85,
        experience: "Expert (8+ years)",
        location: "New York, NY",
        languages: ["English (Native)", "Spanish (Conversational)"],
        portfolioUrls: ["https://github.com/alexmorgan"],
        isAvailable: true,
        visibility: "PUBLIC",
        portfolioProjects: [
          {
            title: "FinTech Dashboard",
            description: "High-throughput financial analytics UI with WebSockets.",
            projectUrl: "https://github.com/alexmorgan/fintech-dashboard",
            imageUrl: "https://images.example.com/dashboard.png",
            skills: ["React", "TypeScript"],
          },
        ],
        employmentHistory: [
          {
            company: "TechNova Inc",
            position: "Senior Engineer",
            startDate: "2020",
            endDate: "2023",
            current: false,
            description: "Built microservices.",
          },
        ],
        educationHistory: [
          {
            institution: "MIT",
            degree: "B.S.",
            fieldOfStudy: "EECS",
            startYear: "2015",
            endYear: "2019",
          },
        ],
        certifications: [
          {
            name: "CKA: Certified Kubernetes Administrator",
            issuer: "CNCF",
            issueDate: "2022",
          },
        ],
      };

      const result = FreelancerProfileSchema.safeParse(fullProfile);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isAvailable).toBe(true);
        expect(result.data.visibility).toBe("PUBLIC");
        expect(result.data.portfolioProjects).toHaveLength(1);
        expect(result.data.employmentHistory).toHaveLength(1);
        expect(result.data.educationHistory).toHaveLength(1);
        expect(result.data.certifications).toHaveLength(1);
      }
    });

    it("rejects invalid visibility options", () => {
      const profile = {
        name: "Test User",
        visibility: "SECRET_PRIVATE",
      };

      const result = FreelancerProfileSchema.safeParse(profile);
      expect(result.success).toBe(false);
    });
  });

  describe("calculateFreelancerProfileCompletion", () => {
    it("returns 0% and lists all missing fields for empty profile", () => {
      const completion = calculateFreelancerProfileCompletion({});
      expect(completion.score).toBe(0);
      expect(completion.missing).toContain("Display Name");
      expect(completion.missing).toContain("Professional Title");
      expect(completion.missing).toContain("Professional Overview (min 20 characters)");
      expect(completion.missing).toContain("Key Skills (at least 1)");
      expect(completion.missing).toContain("Hourly Rate");
      expect(completion.missing).toContain("Location");
      expect(completion.missing).toContain("Languages");
      expect(completion.missing).toContain("Portfolio Project or Link");
      expect(completion.missing).toContain("Employment History");
      expect(completion.missing).toContain("Education or Certification");
    });

    it("returns 100% when all profile sections are completed", () => {
      const completeProfile = {
        name: "Jane Doe",
        title: "Senior Product Designer & Frontend Dev",
        bio: "Passionate engineer with a strong focus on clean UI, accessible design systems, and resilient cloud architectures.",
        skills: ["Figma", "React", "Next.js"],
        hourlyRate: 90,
        location: "Seattle, WA",
        languages: ["English"],
        portfolioProjects: [{ title: "Design System UI Kit" }],
        employmentHistory: [{ company: "DesignCo" }],
        educationHistory: [{ institution: "UW" }],
      };

      const completion = calculateFreelancerProfileCompletion(completeProfile);
      expect(completion.score).toBe(100);
      expect(completion.missing).toHaveLength(0);
    });

    it("recognizes certifications as fulfilling the education/certification requirement", () => {
      const partialProfile = {
        name: "John Smith",
        title: "Cloud Architect",
        bio: "Specializing in enterprise cloud infrastructure, Kubernetes, and automated CI/CD deployments.",
        skills: ["AWS", "Docker", "Kubernetes"],
        hourlyRate: 110,
        location: "Chicago, IL",
        languages: ["English"],
        portfolioUrls: ["https://github.com/johnsmith"],
        employmentHistory: [{ company: "CloudCorp" }],
        certifications: [{ name: "AWS Solutions Architect" }],
      };

      const completion = calculateFreelancerProfileCompletion(partialProfile);
      expect(completion.score).toBe(100);
      expect(completion.missing).not.toContain("Education or Certification");
    });
  });
});

