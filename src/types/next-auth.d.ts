import { DefaultSession } from "next-auth";
import type { Role } from "@/types";

declare module "next-auth" {
  interface User {
    id: string;
    role: Role;
    roleSelected?: boolean;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      roleSelected?: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    roleSelected?: boolean;
  }
}
