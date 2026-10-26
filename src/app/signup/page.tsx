import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = {
  title: "Create an Account | WorkPulse Marketplace",
  description:
    "Sign up as a client to hire top talent or as a freelancer to discover world-class contracts.",
};

export default function SignupPage() {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8 bg-zinc-50 dark:bg-zinc-950">
      <SignupForm />
    </div>
  );
}
