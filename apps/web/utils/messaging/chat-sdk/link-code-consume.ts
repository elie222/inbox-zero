import {
  parseMessagingLinkCode,
  type LinkableMessagingProvider,
} from "./link-code";
import { consumeMessagingLinkNonce } from "@/utils/redis/messaging-link-code";

export async function consumeMessagingLinkCode({
  code,
  provider,
}: {
  code: string;
  provider: LinkableMessagingProvider;
}): Promise<{ emailAccountId: string } | null> {
  const parsedCode = parseMessagingLinkCode({ code, provider });
  if (!parsedCode) return null;

  const nonceAccepted = await consumeMessagingLinkNonce(parsedCode.nonce);
  if (!nonceAccepted) return null;

  return { emailAccountId: parsedCode.emailAccountId };
}
