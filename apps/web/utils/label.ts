export const PARENT_LABEL = "Inbox Zero";

export const inboxZeroLabels = {
  archived: `${PARENT_LABEL}/Archived`,
  acted: `${PARENT_LABEL}/Acted`,
  cold_email: `${PARENT_LABEL}/Cold Email`,
  unsubscribed: `${PARENT_LABEL}/Unsubscribed`,
};
export type InboxZeroLabel = keyof typeof inboxZeroLabels;
