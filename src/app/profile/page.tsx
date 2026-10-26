import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { Role } from "@/types";

async function ProfileRedirectContent() {
  await connection();
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login?redirectTo=/profile");
  }

  if (user.role === Role.FREELANCER) {
    redirect("/profile/freelancer");
  }

  redirect("/profile/client");
  return null;
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-xl px-4 py-20 text-center text-sm text-zinc-500">
          Loading profile...
        </div>
      }
    >
      <ProfileRedirectContent />
    </Suspense>
  );
}
