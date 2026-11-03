import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Role } from "@/types";

const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;

if (process.env.NODE_ENV === "production" && !authSecret) {
  throw new Error(
    "[WorkPulse Auth Fatal] Production deployment requires AUTH_SECRET or NEXTAUTH_SECRET to be configured in environment variables."
  );
}

if (!authSecret) {
  console.warn(
    "[WorkPulse Auth Warning] Neither AUTH_SECRET nor NEXTAUTH_SECRET is configured. Using a local development fallback secret. Please add AUTH_SECRET to .env for production security."
  );
}

// In production, strictly use verified environment secret. In non-production, allow local dev fallback.
const resolvedSecret =
  authSecret ||
  (process.env.NODE_ENV !== "production"
    ? "workpulse-marketplace-local-development-secret-key-32chars"
    : undefined);

const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const baseAdapter = PrismaAdapter(prisma);

// Custom adapter to flag new OAuth signups as needing role onboarding
const customAdapter = {
  ...baseAdapter,
  createUser: async (
    data: Parameters<NonNullable<typeof baseAdapter.createUser>>[0]
  ) => {
    return baseAdapter.createUser!({
      ...data,
      role: Role.CLIENT,
      roleSelected: false,
    });
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: customAdapter,
  secret: resolvedSecret,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Google({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = CredentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const email = parsed.data.email.toLowerCase().trim();

        try {
          const user = await prisma.user.findUnique({
            where: { email },
          });

          if (!user || !user.passwordHash) {
            return null;
          }

          const isPasswordValid = await bcrypt.compare(
            parsed.data.password,
            user.passwordHash
          );

          if (!isPasswordValid) {
            return null;
          }

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            image: user.image,
            roleSelected: user.roleSelected,
            sessionVersion: user.sessionVersion ?? 1,
            emailVerified: user.emailVerified,
          };
        } catch (error) {
          console.error(
            "[WorkPulse Auth Error] Error during user authorization:",
            error instanceof Error ? error.message : "Unknown database error"
          );
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        // 1. Verify Google's email_verified claim before treating email as verified
        const googleProfile = profile as
          | { email_verified?: boolean; emailVerified?: boolean }
          | undefined;
        const isEmailVerified = Boolean(
          googleProfile?.email_verified ?? googleProfile?.emailVerified
        );
        if (!isEmailVerified) {
          console.warn(
            "[WorkPulse Auth] Google sign-in rejected: unverified email address"
          );
          return "/login?error=UnverifiedEmail";
        }

        // 2. Prevent account takeover / unsafe linking:
        // If an account with this email was created via Credentials (password exists),
        // and has not been linked with Google, reject automatic takeover.
        if (user.email) {
          try {
            const existingUser = await prisma.user.findUnique({
              where: { email: user.email.toLowerCase() },
              include: { accounts: true },
            });

            if (existingUser && existingUser.passwordHash) {
              const hasGoogleLinked = existingUser.accounts.some(
                (acc) => acc.provider === "google"
              );
              if (!hasGoogleLinked) {
                console.warn(
                  "[WorkPulse Auth] Google sign-in conflict: account already registered with credentials"
                );
                return "/login?error=OAuthAccountNotLinked";
              }
            }
          } catch (err) {
            console.error(
              "[WorkPulse Auth Error] Account check error:",
              err instanceof Error ? err.message : "Database error"
            );
          }
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as {
          role?: Role;
          roleSelected?: boolean;
          sessionVersion?: number;
          emailVerified?: Date | null;
        };
        token.id = user.id;
        token.role = u.role;
        token.roleSelected = u.roleSelected;
        token.sessionVersion = u.sessionVersion ?? 1;
        token.emailVerified = u.emailVerified;
      }

      // Enforce live database session invalidation & latest state
      if (token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: {
            role: true,
            roleSelected: true,
            sessionVersion: true,
            emailVerified: true,
          },
        });

        // Invalidate JWT session if user was deleted or sessionVersion was incremented (e.g., password reset/change)
        if (!dbUser || (dbUser.sessionVersion ?? 1) !== (token.sessionVersion ?? 1)) {
          return null as unknown as typeof token;
        }

        token.role = dbUser.role;
        token.roleSelected = dbUser.roleSelected;
        token.sessionVersion = dbUser.sessionVersion ?? 1;
        token.emailVerified = dbUser.emailVerified;
      }

      return token;
    },
    async session({ session, token }) {
      if (!token || !token.id) {
        return null as unknown as typeof session;
      }
      if (session.user) {
        session.user.id = token.id as string;
        if (token.role) session.user.role = token.role as Role;
        session.user.roleSelected = token.roleSelected !== false;
        session.user.sessionVersion =
          typeof token.sessionVersion === "number" ? token.sessionVersion : 1;
        session.user.emailVerified =
          (token.emailVerified as Date | null) ?? null;
      }
      return session;
    },
  },
});
