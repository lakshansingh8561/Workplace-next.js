import { NextResponse, connection } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { generateSocketToken } from "@/lib/socket/token";

export async function GET() {
  await connection();
  try {
    const user = await getCurrentUser();

    if (!user || !user.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Active session required" },
        { status: 401 }
      );
    }

    const token = generateSocketToken({
      userId: user.id,
      role: user.role,
      name: user.name || null,
    });

    return NextResponse.json({
      success: true,
      token,
      userId: user.id,
      role: user.role,
      name: user.name,
    });
  } catch (error) {
    console.error("[WorkPulse Socket Token Error]:", error);
    return NextResponse.json(
      { success: false, error: "Failed to issue socket token" },
      { status: 500 }
    );
  }
}
