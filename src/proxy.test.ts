import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn((fn) => fn),
}));

import { handleRouteProtection, config } from "./proxy";

describe("SEC-01: Centralized Route Protection Proxy", () => {
  const origin = "https://workpulse.market";

  describe("handleRouteProtection - Unauthenticated Access Interception", () => {
    it("redirects unauthenticated users from dashboard routes to /login with redirectTo", () => {
      const response = handleRouteProtection({
        nextUrl: {
          pathname: "/dashboard/client",
          search: "",
          origin,
        },
        auth: null,
      });

      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).toBe(
        `${origin}/login?redirectTo=${encodeURIComponent("/dashboard/client")}`
      );
    });

    it("redirects unauthenticated users from freelancer dashboard to /login with redirectTo", () => {
      const response = handleRouteProtection({
        nextUrl: {
          pathname: "/dashboard/freelancer/proposals",
          search: "",
          origin,
        },
        auth: null,
      });

      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).toBe(
        `${origin}/login?redirectTo=${encodeURIComponent(
          "/dashboard/freelancer/proposals"
        )}`
      );
    });

    it("redirects unauthenticated users from contracts pages to /login with redirectTo", () => {
      const response = handleRouteProtection({
        nextUrl: {
          pathname: "/contracts/ct_active_987",
          search: "",
          origin,
        },
        auth: null,
      });

      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).toBe(
        `${origin}/login?redirectTo=${encodeURIComponent(
          "/contracts/ct_active_987"
        )}`
      );
    });

    it("redirects unauthenticated users from messages to /login with preserved conversation query params", () => {
      const response = handleRouteProtection({
        nextUrl: {
          pathname: "/messages",
          search: "?conversationId=conv_xyz_123&tab=unread",
          origin,
        },
        auth: null,
      });

      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).toBe(
        `${origin}/login?redirectTo=${encodeURIComponent(
          "/messages?conversationId=conv_xyz_123&tab=unread"
        )}`
      );
    });

    it("redirects unauthenticated users from private profile settings to /login with redirectTo", () => {
      const response = handleRouteProtection({
        nextUrl: {
          pathname: "/profile/freelancer",
          search: "",
          origin,
        },
        auth: null,
      });

      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).toBe(
        `${origin}/login?redirectTo=${encodeURIComponent("/profile/freelancer")}`
      );
    });

    it("redirects unauthenticated users from /jobs/new to /login with redirectTo", () => {
      const response = handleRouteProtection({
        nextUrl: {
          pathname: "/jobs/new",
          search: "",
          origin,
        },
        auth: null,
      });

      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).toBe(
        `${origin}/login?redirectTo=${encodeURIComponent("/jobs/new")}`
      );
    });

    it("redirects unauthenticated users from /jobs/saved to /login with redirectTo", () => {
      const response = handleRouteProtection({
        nextUrl: {
          pathname: "/jobs/saved",
          search: "",
          origin,
        },
        auth: null,
      });

      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).toBe(
        `${origin}/login?redirectTo=${encodeURIComponent("/jobs/saved")}`
      );
    });

    it("redirects unauthenticated users from /onboarding/role to /login with redirectTo", () => {
      const response = handleRouteProtection({
        nextUrl: {
          pathname: "/onboarding/role",
          search: "",
          origin,
        },
        auth: null,
      });

      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).toBe(
        `${origin}/login?redirectTo=${encodeURIComponent("/onboarding/role")}`
      );
    });
  });

  describe("handleRouteProtection - Authenticated Access Permitted", () => {
    const mockSession = {
      user: {
        id: "usr_client_01",
        email: "client@workpulse.com",
        role: "CLIENT",
      },
    };

    it("allows authenticated users to access client dashboard", () => {
      const response = handleRouteProtection({
        nextUrl: {
          pathname: "/dashboard/client",
          search: "",
          origin,
        },
        auth: mockSession,
      });

      // NextResponse.next() returns a response without 3xx redirect status
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    });

    it("allows authenticated users to access contracts", () => {
      const response = handleRouteProtection({
        nextUrl: {
          pathname: "/contracts/ct_active_987",
          search: "",
          origin,
        },
        auth: mockSession,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    });

    it("allows authenticated users to access messages", () => {
      const response = handleRouteProtection({
        nextUrl: {
          pathname: "/messages",
          search: "?conversationId=conv_xyz",
          origin,
        },
        auth: mockSession,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    });
  });

  describe("Matcher Configuration & Public Route Preservation", () => {
    const matchesPattern = (path: string, patterns: string[]): boolean => {
      return patterns.some((pattern) => {
        // Convert Next.js route matcher syntax to regex:
        // '/:path*' matches the root prefix or any child subpaths
        const regexStr =
          "^" +
          pattern
            .replace(/\/:path\*/g, "(?:/.*)?")
            .replace(/\/:path\+/g, "(?:/.+)")
            .replace(/:[a-zA-Z0-9_]+/g, "[^/]+") +
          "$";
        const regex = new RegExp(regexStr);
        return regex.test(path);
      });
    };

    it("accurately matches all required protected routes", () => {
      const protectedPaths = [
        "/dashboard",
        "/dashboard/client",
        "/dashboard/client/jobs/job_123/proposals",
        "/dashboard/freelancer",
        "/dashboard/freelancer/proposals",
        "/dashboard/freelancer/payments",
        "/contracts",
        "/contracts/ct_xyz_123",
        "/messages",
        "/profile",
        "/profile/client",
        "/profile/freelancer",
        "/jobs/new",
        "/jobs/saved",
        "/onboarding/role",
      ];

      for (const path of protectedPaths) {
        expect(
          matchesPattern(path, config.matcher),
          `Expected ${path} to match protected pattern`
        ).toBe(true);
      }
    });

    it("strictly excludes public routes and never intercepts them", () => {
      const publicPaths = [
        "/",
        "/login",
        "/signup",
        "/jobs",
        "/jobs/job_abc_123",
        "/freelancers/freelancer_xyz",
        "/api/auth/callback/google",
        "/api/auth/signin",
        "/api/auth/session",
        "/api/webhooks/razorpay",
        "/api/jobs",
        "/api/jobs/job_abc_123",
        "/api/jobs/filters",
        "/_next/static/chunks/main.js",
        "/_next/image",
        "/favicon.ico",
        "/homevideo.mp4",
      ];

      for (const path of publicPaths) {
        expect(
          matchesPattern(path, config.matcher),
          `Expected ${path} to NOT match protected pattern (must remain public)`
        ).toBe(false);
      }
    });
  });
});
