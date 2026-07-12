import { env } from "@/env";

export const DELETE_EMAIL_ACTION_DISABLED_MESSAGE =
  "Delete email actions are disabled. Set NEXT_PUBLIC_DELETE_EMAIL_ACTION_ENABLED=true to enable.";

export function isDeleteEmailActionEnabled() {
  return env.NEXT_PUBLIC_DELETE_EMAIL_ACTION_ENABLED === true;
}
