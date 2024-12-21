export const PARENT_LABEL = "Inbox Zero";

export const inboxZeroLabels = {
  archived: {
    name: `${PARENT_LABEL}/Archived`,
    color: "#a4c2f4", // Light blue
  },
  acted: {
    name: `${PARENT_LABEL}/Acted`,
    color: "#b9e4d0", // Light green
  },
  cold_email: {
    name: `${PARENT_LABEL}/Cold Email`,
    color: "#ffdeb5", // Light orange
  },
  unsubscribed: {
    name: `${PARENT_LABEL}/Unsubscribed`,
    color: "#f2b2a8", // Light red
  },
};
export type InboxZeroLabel = keyof typeof inboxZeroLabels;
