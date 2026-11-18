import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { v2 as cloudinary } from "cloudinary";
import { getStorageConfig } from "@/lib/storage";

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "application/pdf",
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Please log in to upload milestone deliverables." },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided in request." },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
      return NextResponse.json(
        {
          error:
            "Invalid file type. Allowed formats: PNG, JPG, JPEG, WebP, and PDF.",
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File exceeds the 10MB size limit." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString("base64");
    const dataUri = `data:${file.type};base64,${base64Data}`;

    const config = getStorageConfig();

    if (config.provider === "cloudinary" && config.cloudName && config.apiKey && config.apiSecret) {
      cloudinary.config({
        cloud_name: config.cloudName,
        api_key: config.apiKey,
        api_secret: config.apiSecret,
        secure: true,
      });

      const isPdf = file.type === "application/pdf";
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
      const publicId = `deliv_${Date.now()}_${sanitizedName}`;

      try {
        const uploadResult = await cloudinary.uploader.upload(dataUri, {
          folder: "workpulse/deliverables",
          public_id: publicId,
          resource_type: isPdf ? "auto" : "image",
          overwrite: true,
        });

        if (uploadResult && uploadResult.secure_url) {
          return NextResponse.json({
            success: true,
            fileUrl: uploadResult.secure_url,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            storageProvider: "cloudinary",
          });
        }
      } catch (cloudErr) {
        console.error("[Milestone Deliverable Cloudinary Upload Error]:", cloudErr);
        // Fall back to dataUri if Cloudinary fails so user work is not blocked
      }
    }

    // Fallback: return data URI for immediate inline preview
    return NextResponse.json({
      success: true,
      fileUrl: dataUri,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      storageProvider: "local",
    });
  } catch (error) {
    console.error("[Milestone Deliverable Upload Route Error]:", error);
    return NextResponse.json(
      { error: "Failed to process deliverable upload. Please try again." },
      { status: 500 }
    );
  }
}

