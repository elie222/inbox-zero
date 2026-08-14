import type { ParsedMessage } from "@/utils/types";

export const AUTOMATED_OUTBOUND_HEADER = "X-Inbox-Zero-Automated";
export const AUTOMATED_OUTBOUND_HEADER_KEY = "x-inbox-zero-automated";
export const AUTOMATED_OUTBOUND_HEADER_VALUE = "true";

export function isAutomatedOutboundMessage(
  message: Pick<ParsedMessage, "headers">,
) {
  return (
    message.headers[AUTOMATED_OUTBOUND_HEADER_KEY] ===
    AUTOMATED_OUTBOUND_HEADER_VALUE
  );
}
