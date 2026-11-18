import { describe, it, expect } from "vitest";
import {
  getDeterministicAvatar,
  getInitials,
  CLIENT_DEMO_IMAGES,
  FREELANCER_DEMO_IMAGES,
} from "@/lib/avatar-map";

describe("WorkPulse Deterministic Avatar & Consistency Engine", () => {
  it("prioritizes real uploaded profile images over demo fallbacks", () => {
    const uploadedUrl = "https://res.cloudinary.com/demo/image/upload/v1234/avatar.png";
    const avatar = getDeterministicAvatar({
      id: "6afbc942dc5cf2fff58ea91f",
      name: "david",
      role: "CLIENT",
      image: uploadedUrl,
    });

    expect(avatar).toBe(uploadedUrl);
  });

  it("ignores invalid, empty, or 'null'/'undefined' string images and falls back to deterministic asset", () => {
    const avatarNullStr = getDeterministicAvatar({
      id: "6afbc942dc5cf2fff58ea91f",
      name: "david",
      role: "CLIENT",
      image: "null",
    });
    expect(CLIENT_DEMO_IMAGES).toContain(avatarNullStr);

    const avatarUndefinedStr = getDeterministicAvatar({
      id: "6afbc942dc5cf2fff58ea91f",
      name: "david",
      role: "CLIENT",
      image: "undefined",
    });
    expect(CLIENT_DEMO_IMAGES).toContain(avatarUndefinedStr);

    const avatarBlank = getDeterministicAvatar({
      id: "6afbc942dc5cf2fff58ea91f",
      name: "david",
      role: "CLIENT",
      image: "   ",
    });
    expect(CLIENT_DEMO_IMAGES).toContain(avatarBlank);
  });

  it("strictly enforces role isolation: CLIENT only gets client demo images", () => {
    const testIds = [
      "user_client_1",
      "user_client_2",
      "user_client_3",
      "6afbc942dc5cf2fff58ea91f",
      "6717a1f0a8d29b0000000c01",
    ];

    for (const id of testIds) {
      const avatar = getDeterministicAvatar({ id, role: "CLIENT" }, "CLIENT");
      expect(CLIENT_DEMO_IMAGES).toContain(avatar);
      expect(FREELANCER_DEMO_IMAGES).not.toContain(avatar);
      expect(avatar.startsWith("/images/client/")).toBe(true);
    }
  });

  it("strictly enforces role isolation: FREELANCER only gets freelancer demo images", () => {
    const testIds = [
      "user_freelancer_1",
      "user_freelancer_2",
      "user_freelancer_3",
      "6afbc942dc5cf2fff58ea91e",
      "6717a1f0a8d29b0000000f01",
    ];

    for (const id of testIds) {
      const avatar = getDeterministicAvatar({ id, role: "FREELANCER" }, "FREELANCER");
      expect(FREELANCER_DEMO_IMAGES).toContain(avatar);
      expect(CLIENT_DEMO_IMAGES).not.toContain(avatar);
      expect(avatar.startsWith("/images/freelancers/")).toBe(true);
    }
  });

  it("is 100% deterministic: produces identical avatar across Navbar, Job Details, Proposals, and Dashboards", () => {
    const clientId = "6afbc942dc5cf2fff58ea91f";
    const clientName = "david";

    // Navbar resolution with userId
    const navbarAvatar = getDeterministicAvatar(
      { id: clientId, name: clientName, role: "CLIENT" },
      "CLIENT"
    );

    // Job Details "About the Client" resolution with userId
    const jobDetailsAvatar = getDeterministicAvatar(
      { id: clientId, name: clientName, role: "CLIENT" },
      "CLIENT"
    );

    // Freelancer Proposals resolution with userId
    const proposalClientAvatar = getDeterministicAvatar(
      { id: clientId, name: clientName, role: "CLIENT" },
      "CLIENT"
    );

    // Client Discovery card resolution with userId
    const discoveryClientAvatar = getDeterministicAvatar(
      { id: clientId, name: clientName, role: "CLIENT" },
      "CLIENT"
    );

    expect(navbarAvatar).toBe(jobDetailsAvatar);
    expect(navbarAvatar).toBe(proposalClientAvatar);
    expect(navbarAvatar).toBe(discoveryClientAvatar);
  });

  it("computes clean uppercase user initials with proper fallbacks", () => {
    expect(getInitials("David Miller")).toBe("DM");
    expect(getInitials("Alice")).toBe("A");
    expect(getInitials("John Robert Smith")).toBe("JS");
    expect(getInitials("", "CL")).toBe("CL");
    expect(getInitials(null, "FL")).toBe("FL");
  });
});

