import { DefaultSession } from "next-auth";
import type { Role } from "@/types";

declare module "next-auth" {
  interface User {
    id: string;
    role: Role;
    roleSelected?: boolean;
    sessionVersion?: number;
    emailVerified?: Date | null;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      roleSelected?: boolean;
      sessionVersion?: number;
      emailVerified?: Date | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    roleSelected?: boolean;
    sessionVersion?: number;
    emailVerified?: Date | null;
  }
}
