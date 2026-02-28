import { z } from "zod";
import {
  generateSignedOAuthState,
  parseSignedOAuthState,
} from "@/utils/oauth/state";

export const MESSAGING_LINK_CODE_MAX_AGE_MS = 10 * 60 * 1000;

export const LINKABLE_MESSAGING_PROVIDERS = ["TEAMS", "TELEGRAM"] as const;

const messagingLinkCodePayloadSchema = z.object({
  type: z.literal("messaging-link"),
  emailAccountId: z.string().min(1),
  provider: z.enum(LINKABLE_MESSAGING_PROVIDERS),
  nonce: z.string().min(8),
  issuedAt: z.number(),
});

export type LinkableMessagingProvider =
  (typeof LINKABLE_MESSAGING_PROVIDERS)[number];

export function generateMessagingLinkCode({
  emailAccountId,
  provider,
}: {
  emailAccountId: string;
  provider: LinkableMessagingProvider;
}): string {
  return generateSignedOAuthState({
    type: "messaging-link",
    emailAccountId,
    provider,
  });
}

export function parseMessagingLinkCode({
  code,
  provider,
}: {
  code: string;
  provider: LinkableMessagingProvider;
}): { emailAccountId: string; nonce: string } | null {
  let parsedPayload: z.infer<typeof messagingLinkCodePayloadSchema>;

  try {
    const payload = parseSignedOAuthState(code, {
      maxAgeMs: MESSAGING_LINK_CODE_MAX_AGE_MS,
    });
    parsedPayload = messagingLinkCodePayloadSchema.parse(payload);
  } catch {
    return null;
  }

  if (parsedPayload.provider !== provider) return null;

  return {
    emailAccountId: parsedPayload.emailAccountId,
    nonce: parsedPayload.nonce,
  };
}
