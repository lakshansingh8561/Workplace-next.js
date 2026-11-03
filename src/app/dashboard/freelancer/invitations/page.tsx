import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { requireRole } from "@/lib/session";
import { Role } from "@prisma/client";
import { getMyInvitationsAction } from "@/lib/actions/invitation";
import { FreelancerInvitationsView } from "@/components/dashboard/FreelancerInvitationsView";

export const metadata: Metadata = {
  title: "Interview Invitations | WorkPulse",
  description: "Review and respond to client interview invitations on WorkPulse.",
};

async function FreelancerInvitationsContent() {
  await connection();
  await requireRole(Role.FREELANCER, "/login");

  const res = await getMyInvitationsAction({ limit: 50 });
  const invitations = res.invitations || [];

  return <FreelancerInvitationsView initialInvitations={invitations} />;
}

export default function FreelancerInvitationsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 text-center text-sm text-zinc-500">
          <div className="h-8 w-8 mx-auto border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3" />
          Loading Interview Invitations...
        </div>
      }
    >
      <FreelancerInvitationsContent />
    </Suspense>
  );
}

