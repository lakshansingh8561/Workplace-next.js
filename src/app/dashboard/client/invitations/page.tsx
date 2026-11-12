import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { requireRole } from "@/lib/session";
import { Role } from "@prisma/client";
import { getMyInvitationsAction } from "@/lib/actions/invitation";
import { ClientInvitationsView } from "@/components/dashboard/ClientInvitationsView";

export const metadata: Metadata = {
  title: "Sent Invitations | WorkPulse Client Dashboard",
  description: "Track and manage interview invitations sent to freelancers on WorkPulse.",
};

async function ClientInvitationsContent() {
  await connection();
  await requireRole(Role.CLIENT, "/login");

  const res = await getMyInvitationsAction({ limit: 50 });
  const invitations = res.invitations || [];

  return <ClientInvitationsView initialInvitations={invitations} />;
}

export default function ClientInvitationsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 text-center text-sm text-zinc-500">
          <div className="h-8 w-8 mx-auto border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3" />
          Loading Sent Invitations...
        </div>
      }
    >
      <ClientInvitationsContent />
    </Suspense>
  );
}

