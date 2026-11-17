"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser, verifyUserForAction } from "@/lib/session";
import { createNotificationSafe } from "@/lib/actions/notification";
import { NotificationType, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export interface SavedSearchItem {
  id: string;
  name: string;
  query?: string | null;
  category?: string | null;
  type?: string | null;
  experience?: string | null;
  skills: string[];
  minBudget?: number | null;
  maxBudget?: number | null;
  alertsEnabled: boolean;
  createdAt: string;
}

const SaveSearchSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(60, "Name is too long"),
  query: z.string().trim().max(100).optional().nullable(),
  category: z.string().trim().max(100).optional().nullable(),
  type: z.enum(["FIXED", "HOURLY"]).optional().nullable(),
  experience: z.enum(["ENTRY", "INTERMEDIATE", "EXPERT"]).optional().nullable(),
  skills: z.array(z.string().trim().min(1).max(40)).max(10).optional().default([]),
  minBudget: z.coerce.number().min(0).optional().nullable(),
  maxBudget: z.coerce.number().min(0).optional().nullable(),
  alertsEnabled: z.boolean().optional().default(true),
});

export type SaveSearchInput = z.infer<typeof SaveSearchSchema>;

/**
 * Saves a new job search with filter preferences for an authenticated freelancer.
 * Strictly verifies freelancer role and derives ownership from session.
 */
export async function saveJobSearchAction(input: unknown): Promise<{
  success: boolean;
  savedSearchId?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}> {
  const authRes = await verifyUserForAction(
    Role.FREELANCER,
    "Unauthorized: Only freelancer accounts can save job searches."
  );
  if (!authRes.success) {
    return { success: false, error: authRes.error };
  }
  const user = authRes.user;

  const parsed = SaveSearchSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      const field = issue.path[0];
      if (field) fieldErrors[String(field)] = issue.message;
    });
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid search parameters.",
      fieldErrors,
    };
  }

  const data = parsed.data;

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, savedSearches: true },
    });

    if (!dbUser) {
      return { success: false, error: "User profile not found." };
    }

    const currentSearches = dbUser.savedSearches || [];

    // Limit maximum saved searches per user to 20
    if (currentSearches.length >= 20) {
      return {
        success: false,
        error: "Maximum of 20 saved searches reached. Please remove an existing search.",
      };
    }

    // Duplicate detection: check if a search with identical name already exists
    const normalizedName = data.name.toLowerCase();
    const isDuplicate = currentSearches.some(
      (s) => s.name.toLowerCase() === normalizedName
    );

    if (isDuplicate) {
      return {
        success: false,
        error: `A saved search named "${data.name}" already exists.`,
      };
    }

    const newId = `srch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newEntry = {
      id: newId,
      name: data.name,
      query: data.query || null,
      category: data.category && data.category !== "all" ? data.category : null,
      type: data.type || null,
      experience: data.experience || null,
      skills: data.skills || [],
      minBudget: data.minBudget ?? null,
      maxBudget: data.maxBudget ?? null,
      alertsEnabled: data.alertsEnabled ?? true,
      createdAt: new Date(),
    };

    await prisma.user.update({
      where: { id: user.id },
      data: {
        savedSearches: {
          push: newEntry,
        },
      },
    });

    revalidatePath("/jobs");
    revalidatePath("/jobs/saved");

    return {
      success: true,
      savedSearchId: newId,
    };
  } catch (error) {
    console.error("[WorkPulse Save Search Action Error]:", error);
    return {
      success: false,
      error: "Failed to save job search preferences. Please try again.",
    };
  }
}

/**
 * Retrieves all saved searches for the currently authenticated freelancer.
 */
export async function getMySavedSearchesAction(): Promise<{
  success: boolean;
  savedSearches: SavedSearchItem[];
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user || user.role !== Role.FREELANCER) {
    return { success: false, savedSearches: [], error: "Unauthorized." };
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { savedSearches: true },
    });

    const raw = dbUser?.savedSearches || [];
    const savedSearches: SavedSearchItem[] = raw.map((s) => ({
      id: s.id,
      name: s.name,
      query: s.query,
      category: s.category,
      type: s.type,
      experience: s.experience,
      skills: s.skills || [],
      minBudget: s.minBudget,
      maxBudget: s.maxBudget,
      alertsEnabled: s.alertsEnabled ?? true,
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : new Date().toISOString(),
    }));

    return { success: true, savedSearches };
  } catch (error) {
    console.error("[WorkPulse Get Saved Searches Error]:", error);
    return { success: false, savedSearches: [], error: "Failed to retrieve saved searches." };
  }
}

/**
 * Updates a saved search's alert setting or name.
 */
export async function updateSavedSearchAction(
  searchId: string,
  updates: { name?: string; alertsEnabled?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const authRes = await verifyUserForAction(Role.FREELANCER);
  if (!authRes.success) {
    return { success: false, error: authRes.error };
  }
  const user = authRes.user;

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { savedSearches: true },
    });

    const searches = dbUser?.savedSearches || [];
    const index = searches.findIndex((s) => s.id === searchId);
    if (index === -1) {
      return { success: false, error: "Saved search not found." };
    }

    const updatedList = searches.map((s) => {
      if (s.id !== searchId) return s;
      return {
        ...s,
        ...(updates.name ? { name: updates.name.trim() } : {}),
        ...(updates.alertsEnabled !== undefined ? { alertsEnabled: updates.alertsEnabled } : {}),
      };
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { savedSearches: { set: updatedList } },
    });

    revalidatePath("/jobs/saved");
    return { success: true };
  } catch (error) {
    console.error("[WorkPulse Update Saved Search Error]:", error);
    return { success: false, error: "Failed to update saved search." };
  }
}

/**
 * Deletes a saved search for the authenticated freelancer.
 */
export async function deleteSavedSearchAction(
  searchId: string
): Promise<{ success: boolean; error?: string }> {
  const authRes = await verifyUserForAction(Role.FREELANCER);
  if (!authRes.success) {
    return { success: false, error: authRes.error };
  }
  const user = authRes.user;

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { savedSearches: true },
    });

    const searches = dbUser?.savedSearches || [];
    const filtered = searches.filter((s) => s.id !== searchId);

    if (filtered.length === searches.length) {
      return { success: false, error: "Saved search not found." };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { savedSearches: { set: filtered } },
    });

    revalidatePath("/jobs/saved");
    return { success: true };
  } catch (error) {
    console.error("[WorkPulse Delete Saved Search Error]:", error);
    return { success: false, error: "Failed to delete saved search." };
  }
}

/**
 * Evaluates a newly published job against freelancers' saved searches and dispatches
 * idempotent in-app job alert notifications.
 */
export async function matchJobAlertsForPublishedJob(job: {
  id: string;
  title: string;
  description: string;
  category: string;
  skills: string[];
  type: string;
  budget?: number | null;
  hourlyMin?: number | null;
  hourlyMax?: number | null;
  clientId?: string | null;
}): Promise<number> {
  try {
    if (typeof prisma.user?.findMany !== "function") {
      return 0;
    }

    // Find freelancers who have saved searches
    const freelancers = (await prisma.user.findMany({
      where: {
        role: "FREELANCER",
        roleSelected: true,
        savedSearches: { isEmpty: false },
      },
      select: {
        id: true,
        savedSearches: true,
      },
      take: 100, // Batch limit to preserve DB performance
    })) || [];

    let alertsDispatched = 0;

    for (const fl of freelancers) {
      if (fl.id === job.clientId) continue; // Skip if self

      for (const search of fl.savedSearches || []) {
        if (!search.alertsEnabled) continue;

        let matches = true;

        // 1. Keyword query match (title, description, skills)
        if (search.query) {
          const q = search.query.toLowerCase();
          const inTitle = job.title.toLowerCase().includes(q);
          const inDesc = job.description.toLowerCase().includes(q);
          const inSkills = job.skills.some((s) => s.toLowerCase().includes(q));
          if (!inTitle && !inDesc && !inSkills) {
            matches = false;
          }
        }

        // 2. Category match
        if (matches && search.category && search.category !== "all") {
          if (job.category.toLowerCase() !== search.category.toLowerCase()) {
            matches = false;
          }
        }

        // 3. Payment type match
        if (matches && search.type) {
          if (job.type.toUpperCase() !== search.type.toUpperCase()) {
            matches = false;
          }
        }

        // 4. Skills match (if specified in search, at least one skill must match)
        if (matches && search.skills && search.skills.length > 0) {
          const hasCommonSkill = search.skills.some((s) =>
            job.skills.map((js) => js.toLowerCase()).includes(s.toLowerCase())
          );
          if (!hasCommonSkill) {
            matches = false;
          }
        }

        // 5. Budget match
        if (matches && search.minBudget !== null && search.minBudget !== undefined) {
          const effectiveBudget = job.budget ?? job.hourlyMin ?? 0;
          if (effectiveBudget < search.minBudget) {
            matches = false;
          }
        }

        if (matches) {
          // Idempotent dispatch: guarantees exactly one alert per (search, job)
          const idempotencyKey = `job-alert:${search.id}:${job.id}`;
          await createNotificationSafe({
            userId: fl.id,
            type: NotificationType.JOB_ALERT,
            title: `Job Alert: "${search.name}" 🎯`,
            message: `A new matching job "${job.title}" was just posted in ${job.category}.`,
            link: `/jobs/${job.id}`,
            idempotencyKey,
          });
          alertsDispatched++;
          break; // One alert per freelancer per job posting is enough
        }
      }
    }

    return alertsDispatched;
  } catch (err) {
    console.error("[WorkPulse Match Job Alerts Error]:", err);
    return 0;
  }
}
