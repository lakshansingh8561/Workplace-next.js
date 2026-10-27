import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isStorageConfigured, getScreenshotImage } from "@/lib/storage";

interface ScreenshotRouteParams {
  params: Promise<{
    id: string;
    screenshotId: string;
  }>;
}

/**
 * Authenticated screenshot retrieval endpoint.
 * Strict authorization: Only the assigned client or freelancer on the contract
 * may retrieve work activity screenshot frames.
 */
export async function GET(
  request: Request,
  { params }: ScreenshotRouteParams
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Please log in to view contract screenshots." },
        { status: 401 }
      );
    }

    const { id: contractId, screenshotId } = await params;

    const screenshot = await prisma.timeScreenshot.findUnique({
      where: { id: screenshotId },
      include: {
        contract: {
          select: {
            clientId: true,
            freelancerId: true,
          },
        },
      },
    });

    if (!screenshot || screenshot.contractId !== contractId) {
      return NextResponse.json(
        { error: "Screenshot record not found." },
        { status: 404 }
      );
    }

    // Enforce contract membership
    const isClient = screenshot.contract.clientId === user.id;
    const isFreelancer = screenshot.contract.freelancerId === user.id;

    if (!isClient && !isFreelancer) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to access screenshots for this contract." },
        { status: 403 }
      );
    }

    if (!isStorageConfigured() || !screenshot.imageUrl) {
      return NextResponse.json(
        { error: "Screenshot image is unavailable. Object storage is not configured." },
        { status: 404 }
      );
    }

    const stored = await getScreenshotImage(screenshot.id);
    if (!stored) {
      return NextResponse.json(
        { error: "Screenshot image binary not found in storage." },
        { status: 404 }
      );
    }

    // Stream binary image with correct Content-Type header
    return new Response(new Uint8Array(stored.buffer), {
      status: 200,
      headers: {
        "Content-Type": stored.contentType || "image/webp",
        "Cache-Control": "private, max-age=86400, no-transform",
        "Content-Disposition": `inline; filename="screenshot-${screenshot.id}.webp"`,
      },
    });
  } catch (error) {
    console.error("[WorkPulse Screenshot Route Error]:", error);
    return NextResponse.json(
      { error: "Internal server error retrieving screenshot." },
      { status: 500 }
    );
  }
}
