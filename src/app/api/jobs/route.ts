import { NextRequest, NextResponse } from "next/server";
import { getJobs } from "@/lib/jobs";
import { ZodError } from "zod";

/**
 * GET /api/jobs
 * Returns a paginated list of jobs with support for search, category,
 * type, experience level, and sorting.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const queryParams = {
      search: searchParams.get("search") || undefined,
      category: searchParams.get("category") || undefined,
      type: searchParams.get("type") || undefined,
      experienceLevel: searchParams.get("experienceLevel") || undefined,
      sortBy: searchParams.get("sortBy") || "newest",
      page: searchParams.get("page") || "1",
      limit: searchParams.get("limit") || "10",
    };

    const { data, pagination, source } = await getJobs(queryParams);

    return NextResponse.json(
      {
        data,
        pagination,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "X-Data-Source": source,
        },
      }
    );
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_")) {
      throw error;
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid query parameters",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    console.error("[GET /api/jobs Error]:", error);
    return NextResponse.json(
      {
        error: "Internal server error fetching jobs",
      },
      { status: 500 }
    );
  }
}
