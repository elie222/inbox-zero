import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env";
import { secureCompare } from "@/utils/crypto-compare";
import type { Logger } from "@/utils/logger";

export function getThunderbirdBridgeSecret(): string | null {
  return env.THUNDERBIRD_BRIDGE_SECRET || env.INTERNAL_API_KEY || null;
}

export function isValidThunderbirdBridgeRequest(
  request: Request,
  logger: Logger,
): boolean {
  const secret = getThunderbirdBridgeSecret();
  if (!secret) {
    logger.error("Thunderbird bridge secret is not configured");
    return false;
  }

  const header =
    request.headers.get("x-thunderbird-bridge-secret") ||
    request.headers.get("x-api-key");
  if (!secureCompare(header, secret)) {
    logger.error("Invalid Thunderbird bridge secret");
    return false;
  }

  return true;
}

export function thunderbirdUnauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export const thunderbirdInboundMessageSchema = z.object({
  accountEmail: z.string().email(),
  thunderbirdAccountId: z.string().min(1),
  thunderbirdMessageId: z.number().int().positive(),
  folderPath: z.string().optional(),
  folderId: z.string().optional(),
  messageId: z.string().min(1).optional(),
  threadId: z.string().min(1).optional(),
  subject: z.string().default(""),
  from: z.string().min(1),
  to: z.string().default(""),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  date: z.string().optional(),
  textPlain: z.string().optional(),
  textHtml: z.string().optional(),
  snippet: z.string().optional(),
  headerMessageId: z.string().optional(),
  inReplyTo: z.string().optional(),
  references: z.string().optional(),
  listUnsubscribe: z.string().optional(),
  tags: z.array(z.string()).optional(),
  read: z.boolean().optional(),
  flagged: z.boolean().optional(),
  isSent: z.boolean().optional(),
});

export type ThunderbirdInboundMessage = z.infer<
  typeof thunderbirdInboundMessageSchema
>;
