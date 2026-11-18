import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { v2 as cloudinary } from "cloudinary";
import { getStorageConfig } from "@/lib/storage";
import { revalidatePath } from "next/cache";

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Please log in to update your profile photo." },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No image file provided." },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
      return NextResponse.json(
        {
          error:
            "Invalid image format. Allowed formats: PNG, JPG, JPEG, and WebP.",
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Image file exceeds the 5MB size limit." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString("base64");
    const dataUri = `data:${file.type};base64,${base64Data}`;

    let uploadedUrl = dataUri;
    const config = getStorageConfig();

    if (
      config.provider === "cloudinary" &&
      config.cloudName &&
      config.apiKey &&
      config.apiSecret
    ) {
      cloudinary.config({
        cloud_name: config.cloudName,
        api_key: config.apiKey,
        api_secret: config.apiSecret,
        secure: true,
      });

      const publicId = `avatar_${user.id}_${Date.now()}`;

      try {
        const uploadResult = await cloudinary.uploader.upload(dataUri, {
          folder: "workpulse/avatars",
          public_id: publicId,
          resource_type: "image",
          transformation: [
            { width: 400, height: 400, crop: "fill", gravity: "face" },
            { quality: "auto", fetch_format: "auto" },
          ],
          overwrite: true,
        });

        if (uploadResult && uploadResult.secure_url) {
          uploadedUrl = uploadResult.secure_url;
        }
      } catch (cloudErr) {
        console.error("[Profile Photo Cloudinary Upload Error]:", cloudErr);
        // Fall back to dataUri if Cloudinary fails so user profile update is not blocked
      }
    }

    // Persist canonical image URL to database User.image
    await prisma.user.update({
      where: { id: user.id },
      data: { image: uploadedUrl },
    });

    // Revalidate paths where user avatar is displayed
    revalidatePath("/");
    revalidatePath("/dashboard/client");
    revalidatePath("/dashboard/freelancer");
    revalidatePath("/dashboard/freelancer/proposals");
    revalidatePath("/profile/client");
    revalidatePath("/profile/freelancer");
    revalidatePath(`/clients/${user.id}`);
    revalidatePath(`/freelancers/${user.id}`);
    revalidatePath("/jobs");
    revalidatePath("/freelancers");
    revalidatePath("/clients");
    revalidatePath("/contracts");
    revalidatePath("/messages");

    return NextResponse.json({
      success: true,
      imageUrl: uploadedUrl,
    });
  } catch (error) {
    console.error("[Profile Photo Upload API Error]:", error);
    return NextResponse.json(
      { error: "Failed to upload and update profile photo." },
      { status: 500 }
    );
  }
}

