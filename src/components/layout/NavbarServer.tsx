import { Navbar } from "./Navbar";
import { getCurrentUser } from "@/lib/session";
import { connection } from "next/server";

export async function NavbarServer() {
  await connection();
  const user = await getCurrentUser();
  return <Navbar user={user} />;
}
