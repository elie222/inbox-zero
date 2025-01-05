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

const LABEL_COLORS = [
  "#b6cff5", // Light blue
  "#98d7e4", // Light cyan
  "#e3d7ff", // Light purple
  "#fbd3e0", // Light pink
  "#f2b2a8", // Light red
  "#ffc8af", // Light coral
  "#ffdeb5", // Light orange
  "#fdedc1", // Light yellow
  "#b3efd3", // Light green
  "#a2dcc1", // Mint green
] as const;

export function getRandomLabelColor() {
  return LABEL_COLORS[Math.floor(Math.random() * LABEL_COLORS.length)];
}
