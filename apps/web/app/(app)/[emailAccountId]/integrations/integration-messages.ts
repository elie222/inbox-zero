import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";

// utils/mcp/integrations is server code, so the UI keeps translatable copies
// of the built-in integration descriptions here, keyed by integration name.
export const INTEGRATION_DESCRIPTION_MESSAGES: Partial<
  Record<string, MessageDescriptor>
> = {
  pipedream: msg`Hundreds more apps`,
};
