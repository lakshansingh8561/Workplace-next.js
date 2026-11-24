import { ChatMessageDto } from "../actions/message";
import { getSocketServerUrl } from "./client";

const SECRET =
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  "workpulse-marketplace-local-development-secret-key-32chars";

/**
 * Dispatches an internal HTTP broadcast to the Socket.IO standalone server.
 * Ensures real-time delivery to connected WebSocket clients even when messages
 * are created or persisted via Next.js Server Actions.
 */
export async function broadcastMessageToSocketServer(
  conversationId: string,
  message: ChatMessageDto,
  counterpartyId?: string
): Promise<boolean> {
  if (!conversationId || !message) {
    return false;
  }

  try {
    const baseUrl =
      process.env.INTERNAL_SOCKET_URL ||
      process.env.SOCKET_SERVER_URL ||
      process.env.NEXT_PUBLIC_SOCKET_URL ||
      (process.env.VERCEL || process.env.NODE_ENV === "production"
        ? "https://workplace-next-js.onrender.com"
        : getSocketServerUrl());

    const cleanBaseUrl = baseUrl.replace(/\/$/, "");
    const endpoint = `${cleanBaseUrl}/api/socket/broadcast`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversationId,
        message,
        counterpartyId,
        secret: SECRET,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    return res.ok;
  } catch (err) {
    // Non-blocking: failure to reach socket server should never break database operations
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("abort")) {
      console.warn("[WorkPulse Socket Broadcast Notice]: Socket server unreachable, falling back to database persistence:", msg);
    }
    return false;
  }
}

/**
 * Dispatches an internal HTTP broadcast for contract and milestone lifecycle events.
 * Immediately alerts connected clients across browser tabs and independent devices.
 */
export async function broadcastContractEventToSocketServer(
  contractId: string,
  counterpartyId?: string,
  milestoneId?: string,
  status?: string
): Promise<boolean> {
  if (!contractId) {
    return false;
  }

  try {
    const baseUrl =
      process.env.INTERNAL_SOCKET_URL ||
      process.env.SOCKET_SERVER_URL ||
      process.env.NEXT_PUBLIC_SOCKET_URL ||
      (process.env.VERCEL || process.env.NODE_ENV === "production"
        ? "https://workplace-next-js.onrender.com"
        : getSocketServerUrl());

    const cleanBaseUrl = baseUrl.replace(/\/$/, "");
    const endpoint = `${cleanBaseUrl}/api/socket/broadcast`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contractId,
        counterpartyId,
        milestoneId,
        status,
        secret: SECRET,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

