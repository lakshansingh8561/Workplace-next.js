import crypto from "crypto";

export interface SocketTokenPayload {
  userId: string;
  role: string;
  name?: string | null;
  expiresAt: number;
}

const SECRET =
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  "workpulse-marketplace-local-development-secret-key-32chars";

/**
 * Creates a signed HMAC-SHA256 socket authentication token.
 * Valid for 2 hours by default.
 */
export function generateSocketToken(
  payload: Omit<SocketTokenPayload, "expiresAt">,
  ttlMs: number = 2 * 60 * 60 * 1000
): string {
  const tokenData: SocketTokenPayload = {
    ...payload,
    expiresAt: Date.now() + ttlMs,
  };

  const encodedData = Buffer.from(JSON.stringify(tokenData)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(encodedData)
    .digest("base64url");

  return `${encodedData}.${signature}`;
}

/**
 * Verifies and decodes an HMAC-SHA256 socket token.
 * Returns null if invalid or expired.
 */
export function verifySocketToken(token: string): SocketTokenPayload | null {
  if (!token || typeof token !== "string") {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [encodedData, signature] = parts;

  try {
    const expectedSignature = crypto
      .createHmac("sha256", SECRET)
      .update(encodedData)
      .digest("base64url");

    if (
      signature.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
    ) {
      return null;
    }

    const json = Buffer.from(encodedData, "base64url").toString("utf8");
    const payload = JSON.parse(json) as SocketTokenPayload;

    if (!payload.userId || !payload.expiresAt) {
      return null;
    }

    if (Date.now() > payload.expiresAt) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

