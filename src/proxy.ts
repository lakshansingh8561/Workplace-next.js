import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export interface AuthenticatedNextRequest extends NextRequest {
  auth?: unknown;
}

/**
 * Route protection logic:
 * Evaluates whether the incoming request has an authenticated session.
 * If unauthenticated, safely redirects to /login with the intended destination
 * preserved in the redirectTo search parameter.
 */
export function handleRouteProtection(req: {
  nextUrl: { pathname: string; search: string; origin: string };
  auth: unknown;
}) {
  const { pathname, search, origin } = req.nextUrl;
  const isAuthenticated = !!req.auth;

  if (!isAuthenticated) {
    const destination = pathname + search;
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("redirectTo", destination);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

/**
 * WorkPulse Centralized Route Protection Proxy (Next.js 16)
 *
 * Intercepts incoming requests before rendering to ensure that all private routes
 * require an authenticated session. Unauthenticated users are redirected to /login
 * with a preserved redirectTo destination parameter.
 *
 * Server-side authorization (requireUser, requireRole, ownership checks) remains
 * strictly enforced in Server Components and Actions for multi-layered defense.
 */
export const proxy = auth((req) => {
  return handleRouteProtection(req);
});

export default proxy;

/**
 * Targeted Route Matcher:
 * Only intercepts private application routes requiring authentication.
 *
 * Strictly leaves all public routes untouched:
 * - Public landing: /
 * - Public auth: /login, /signup
 * - Public marketplace: /jobs, /jobs/:id
 * - Public freelancer profiles: /freelancers/:id
 * - Auth callback endpoints: /api/auth/:path*
 * - Webhooks: /api/webhooks/:path*
 * - Public APIs: /api/jobs/:path*
 * - Static assets & metadata: _next, favicon.ico, images, videos
 */
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/contracts/:path*",
    "/messages/:path*",
    "/profile/:path*",
    "/jobs/new",
    "/jobs/saved",
    "/onboarding/role",
  ],
};
