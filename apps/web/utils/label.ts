export const PARENT_LABEL = "Inbox Zero";

export const inboxZeroLabels = {
  archived: {
    name: `${PARENT_LABEL}/Archived`,
    color: "#cfe2f3", // Light blue 2
  },
  acted: {
    name: `${PARENT_LABEL}/Acted`,
    color: "#d9ead3", // Light green 1
  },
  cold_email: {
    name: `${PARENT_LABEL}/Cold Email`,
    color: "#fce5cd", // Light orange 2
  },
  unsubscribed: {
    name: `${PARENT_LABEL}/Unsubscribed`,
    color: "#f4cccc", // Light red
  },
};
export type InboxZeroLabel = keyof typeof inboxZeroLabels;
