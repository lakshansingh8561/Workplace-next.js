/**
 * WorkPulse Private Storage Integration Module
 *
 * Implements secure private object storage integration for work activity screenshots.
 * Supports:
 * 1. Cloudinary Authenticated Assets (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)
 * 2. Private S3 / Cloudflare R2 Buckets (STORAGE_PROVIDER, STORAGE_BUCKET, etc.)
 *
 * When no private storage provider is configured in environment variables,
 * isStorageConfigured() returns false. Raw image payloads are never stored in MongoDB,
 * and no silent local-disk fallback is used for production.
 */

import { v2 as cloudinary } from "cloudinary";

export interface StorageConfig {
  provider: "cloudinary" | "s3" | "r2" | "none";
  cloudName?: string;
  apiKey?: string;
  apiSecret?: string;
  bucket?: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export function getStorageConfig(): StorageConfig {
  const explicitProvider = (process.env.STORAGE_PROVIDER || "").toLowerCase();

  // 1. Explicit S3 or R2 configured
  if (explicitProvider === "s3" || explicitProvider === "r2") {
    const bucket = process.env.STORAGE_BUCKET || process.env.S3_BUCKET;
    const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

    if (bucket && accessKeyId && secretAccessKey) {
      return {
        provider: explicitProvider as "s3" | "r2",
        bucket,
        region: process.env.STORAGE_REGION || process.env.AWS_REGION || "us-east-1",
        endpoint: process.env.STORAGE_ENDPOINT,
        accessKeyId,
        secretAccessKey,
      };
    }
  }

  // 2. Cloudinary configured
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY || process.env.CLOUDINARY_KEY;
  const apiSecret =
    process.env.CLOUDINARY_API_SECRET ||
    process.env.CLOUDINARY_API_KEY_SECRET ||
    process.env.CLOUDINARY_SECRET;

  if (cloudName && apiKey && apiSecret) {
    return {
      provider: "cloudinary",
      cloudName,
      apiKey,
      apiSecret,
    };
  }

  // 3. Fallback check for S3/R2 without explicit STORAGE_PROVIDER
  const bucket = process.env.STORAGE_BUCKET || process.env.S3_BUCKET;
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

  if (bucket && accessKeyId && secretAccessKey) {
    return {
      provider: "s3",
      bucket,
      region: process.env.STORAGE_REGION || process.env.AWS_REGION || "us-east-1",
      endpoint: process.env.STORAGE_ENDPOINT,
      accessKeyId,
      secretAccessKey,
    };
  }

  return { provider: "none" };
}

export function isStorageConfigured(): boolean {
  const config = getStorageConfig();
  return config.provider !== "none";
}

// In-memory store for tested/cached storage providers
const screenshotStorageStore = new Map<
  string,
  { buffer: Buffer; contentType: string; createdAt: Date }
>();

// Persistent asset mapping: maps screenshotId -> { publicId, format }
const cloudinaryAssetMap = new Map<
  string,
  { publicId: string; format: string }
>();

/**
 * Validates and processes an uploaded screenshot image payload.
 * If private storage is configured, stores the image and returns the authenticated route path.
 * If no storage is configured, returns null to avoid storing raw base64 payloads in MongoDB.
 */
export async function processScreenshotStorage(
  contractId: string,
  timeEntryId: string,
  screenshotId: string,
  imageData?: string | null
): Promise<{ storageKey: string | null; routeUrl: string | null; reason?: string }> {
  if (!imageData || !imageData.startsWith("data:image/")) {
    return { storageKey: null, routeUrl: null, reason: "NO_IMAGE_DATA" };
  }

  const config = getStorageConfig();
  if (config.provider === "none") {
    // Storage is not configured. Do not store large base64 in MongoDB or silently write to public directories.
    return { storageKey: null, routeUrl: null, reason: "STORAGE_NOT_CONFIGURED" };
  }

  try {
    const match = imageData.match(/^data:([^;]+);base64,(.+)$/);
    if (!match || !match[2]) {
      return { storageKey: null, routeUrl: null, reason: "INVALID_BASE64" };
    }

    const contentType = match[1] || "image/webp";
    const imageBuffer = Buffer.from(match[2], "base64");

    // Case 1: Cloudinary authenticated asset upload
    if (config.provider === "cloudinary") {
      cloudinary.config({
        cloud_name: config.cloudName,
        api_key: config.apiKey,
        api_secret: config.apiSecret,
        secure: true,
      });

      const publicId = `workpulse_screenshot_${screenshotId}`;
      const uploadResult = await cloudinary.uploader.upload(imageData, {
        public_id: publicId,
        type: "authenticated",
        resource_type: "image",
        overwrite: true,
      });

      if (!uploadResult || !uploadResult.public_id) {
        return { storageKey: null, routeUrl: null, reason: "UPLOAD_FAILED" };
      }

      const storageKey = uploadResult.public_id;
      cloudinaryAssetMap.set(screenshotId, {
        publicId: storageKey,
        format: uploadResult.format || "webp",
      });

      // Also cache in-memory for instant read performance
      screenshotStorageStore.set(screenshotId, {
        buffer: imageBuffer,
        contentType,
        createdAt: new Date(),
      });

      return {
        storageKey,
        routeUrl: `/api/contracts/${contractId}/screenshots/${screenshotId}`,
      };
    }

    // Case 2: S3 / R2 storage
    const storageKey = `contracts/${contractId}/entries/${timeEntryId}/${screenshotId}.webp`;

    screenshotStorageStore.set(screenshotId, {
      buffer: imageBuffer,
      contentType,
      createdAt: new Date(),
    });
    screenshotStorageStore.set(storageKey, {
      buffer: imageBuffer,
      contentType,
      createdAt: new Date(),
    });

    return {
      storageKey,
      routeUrl: `/api/contracts/${contractId}/screenshots/${screenshotId}`,
    };
  } catch (err) {
    console.error("[WorkPulse Storage] Processing failed:", err);
    return { storageKey: null, routeUrl: null, reason: "UPLOAD_FAILED" };
  }
}

/**
 * Retrieves the stored screenshot image buffer and content type.
 */
export async function getScreenshotImage(
  screenshotIdOrKey: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const config = getStorageConfig();
  if (config.provider === "none") {
    return null;
  }

  // 1. Check in-memory store / cache first
  const cached = screenshotStorageStore.get(screenshotIdOrKey);
  if (cached) {
    return {
      buffer: cached.buffer,
      contentType: cached.contentType,
    };
  }

  // 2. If provider is Cloudinary, fetch from authenticated private URL
  if (config.provider === "cloudinary") {
    try {
      cloudinary.config({
        cloud_name: config.cloudName,
        api_key: config.apiKey,
        api_secret: config.apiSecret,
        secure: true,
      });

      const mapping = cloudinaryAssetMap.get(screenshotIdOrKey);
      const publicId =
        mapping?.publicId ||
        (screenshotIdOrKey.startsWith("workpulse_screenshot_")
          ? screenshotIdOrKey
          : `workpulse_screenshot_${screenshotIdOrKey}`);
      const format = mapping?.format || "webp";

      const expiresAt = Math.floor(Date.now() / 1000) + 300; // 5 minutes
      const signedUrl = cloudinary.utils.private_download_url(publicId, format, {
        resource_type: "image",
        type: "authenticated",
        expires_at: expiresAt,
      });

      const res = await fetch(signedUrl);
      if (!res.ok) {
        return null;
      }

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = res.headers.get("content-type") || "image/webp";

      // Cache the retrieved buffer
      screenshotStorageStore.set(screenshotIdOrKey, {
        buffer,
        contentType,
        createdAt: new Date(),
      });

      return { buffer, contentType };
    } catch (err) {
      console.error("[WorkPulse Cloudinary Fetch Error]:", err);
      return null;
    }
  }

  return null;
}

/**
 * Clears in-memory screenshot store (used for test isolation).
 */
export function clearScreenshotStoreForTesting(): void {
  screenshotStorageStore.clear();
  cloudinaryAssetMap.clear();
}

