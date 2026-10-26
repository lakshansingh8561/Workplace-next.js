import { NextRequest, NextResponse } from "next/server";
import { getJobById, isValidObjectId } from "@/lib/jobs";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

/**
 * GET /api/jobs/[id]
 * Retrieves a single job by its ID.
 * Returns 400 for malformed ObjectIds.
 * Returns 404 if the job cannot be found.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
    }

    if (!isValidObjectId(id)) {
      return NextResponse.json(
        { error: `Invalid job ID '${id}'. Expected a 24-character hexadecimal ObjectId.` },
        { status: 400 }
      );
    }

    const { data: job, source } = await getJobById(id);

    if (!job) {
      return NextResponse.json(
        { error: `Job with ID '${id}' was not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { data: job },
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

    console.error("[GET /api/jobs/[id] Error]:", error);
    return NextResponse.json(
      { error: "Internal server error retrieving job details" },
      { status: 500 }
    );
  }
}
