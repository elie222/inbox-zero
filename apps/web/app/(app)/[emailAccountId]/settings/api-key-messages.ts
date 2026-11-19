import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import type {
  ApiKeyExpiryValue,
  ApiKeyScopeValue,
} from "@/utils/api-key-scopes";

// The English metadata in utils/api-key-scopes also feeds the public OpenAPI
// spec, so the UI keeps its translatable copies here.
export const API_KEY_SCOPE_MESSAGES: Record<
  ApiKeyScopeValue,
  { label: MessageDescriptor; description: MessageDescriptor }
> = {
  STATS_READ: {
    label: msg`Read stats`,
    description: msg`Read aggregated inbox statistics for this inbox.`,
  },
  RULES_READ: {
    label: msg`Read rules`,
    description: msg`List and inspect automation rules for this inbox.`,
  },
  RULES_WRITE: {
    label: msg`Write rules`,
    description: msg`Create, update, and delete automation rules for this inbox.`,
  },
  SETTINGS_READ: {
    label: msg`Read settings`,
    description: msg`Read inbox settings for this inbox.`,
  },
  SETTINGS_WRITE: {
    label: msg`Write settings`,
    description: msg`Update inbox settings for this inbox.`,
  },
  ASSISTANT_CHAT: {
    label: msg`Assistant chat`,
    description: msg`Start assistant chat sessions for this inbox.`,
  },
  SENDERS_UNSUBSCRIBE: {
    label: msg`Unsubscribe senders`,
    description: msg`Unsubscribe from senders for this inbox.`,
  },
};

export const API_KEY_EXPIRY_MESSAGES: Record<
  ApiKeyExpiryValue,
  MessageDescriptor
> = {
  "30": msg`30 days`,
  "90": msg`90 days`,
  "365": msg`1 year`,
  never: msg`No expiry`,
};
