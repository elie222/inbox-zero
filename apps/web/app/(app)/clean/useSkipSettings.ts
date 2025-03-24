import { parseAsBoolean, useQueryStates } from "nuqs";

export function useSkipSettings() {
  return useQueryStates({
    skipReply: parseAsBoolean.withDefault(true),
    skipStarred: parseAsBoolean.withDefault(true),
    skipCalendar: parseAsBoolean.withDefault(true),
    skipReceipt: parseAsBoolean.withDefault(false),
    skipAttachment: parseAsBoolean.withDefault(false),
    skipConversation: parseAsBoolean.withDefault(false),
  });
}
