import { NextResponse } from "next/server";
import { getJobFilterOptions } from "@/lib/jobs";

/**
 * GET /api/jobs/filters
 * Returns live filter facets derived from OPEN jobs in MongoDB Atlas.
 */
export async function GET() {
  try {
    const facets = await getJobFilterOptions();
    return NextResponse.json(
      { facets },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    console.error("[GET /api/jobs/filters Error]:", error);
    return NextResponse.json(
      { error: "Failed to load job filter options" },
      { status: 500 }
    );
  }
}
