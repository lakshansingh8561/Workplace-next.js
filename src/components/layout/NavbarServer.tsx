import { Navbar } from "./Navbar";
import { getCurrentUser } from "@/lib/session";
import { connection } from "next/server";
import { VerificationBanner } from "@/components/auth/VerificationBanner";

export async function NavbarServer() {
  await connection();
  const user = await getCurrentUser();
  return (
    <>
      <Navbar user={user} />
      <VerificationBanner
        email={user?.email}
        isVerified={Boolean(user?.emailVerified)}
      />
    </>
  );
}
