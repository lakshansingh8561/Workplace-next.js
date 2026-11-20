import crypto from "crypto";

export interface SocketTokenPayload {
  userId: string;
  role: string;
  name?: string | null;
  expiresAt: number;
}

const DEFAULT_SECRET =
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  "workpulse-marketplace-local-development-secret-key-32chars";

// Candidate secrets for cross-deployment authorization between Vercel and Render
const CANDIDATE_SECRETS = Array.from(
  new Set(
    [
      process.env.AUTH_SECRET,
      process.env.NEXTAUTH_SECRET,
      "kSm1x2Ul3j8r1x01Q28I792MTFOYR/eydH4d9jLdDF8=",
      "workpulse-marketplace-local-development-secret-key-32chars",
    ].filter((s): s is string => Boolean(s && s.trim()))
  )
);

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
    .createHmac("sha256", DEFAULT_SECRET)
    .update(encodedData)
    .digest("base64url");

  return `${encodedData}.${signature}`;
}

/**
 * Verifies and decodes an HMAC-SHA256 socket token.
 * Validates signature against candidate secrets to guarantee cross-deployment resilience.
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
    let isValidSignature = false;

    for (const secret of CANDIDATE_SECRETS) {
      const candidateSig = crypto
        .createHmac("sha256", secret)
        .update(encodedData)
        .digest("base64url");

      if (
        signature.length === candidateSig.length &&
        crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(candidateSig))
      ) {
        isValidSignature = true;
        break;
      }
    }

    if (!isValidSignature) {
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

