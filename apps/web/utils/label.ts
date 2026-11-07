import { messageVisibility } from "@/utils/gmail/constants";
import { getRuleLabel } from "@/utils/rule/consts";
import { SystemType } from "@/generated/prisma/enums";

export const PARENT_LABEL = "Inbox Zero";

const labelColors = {
  blue: "#b6cff5",
  cyan: "#98d7e4",
  purple: "#e3d7ff",
  pink: "#fcdee8",
  red: "#f2b2a8",
  coral: "#ffc8af",
  orange: "#ffdeb5",
  yellow: "#fdedc1",
  green: "#b3efd3",
  rose: "#fbc8d9",
  gray: "#c2c2c2",
} as const;

export type LabelColorName = keyof typeof labelColors;

const RANDOM_LABEL_COLORS = Object.values(labelColors).filter(
  (color) => color !== labelColors.gray,
);

export const inboxZeroLabels = {
  archived: {
    name: `${PARENT_LABEL}/Archived`,
    colorName: "blue",
    messageListVisibility: messageVisibility.hide,
  },
  marked_read: {
    name: `${PARENT_LABEL}/Read`,
    colorName: "blue",
    messageListVisibility: messageVisibility.hide,
  },
  unsubscribed: {
    name: `${PARENT_LABEL}/Unsubscribed`,
    colorName: "red",
    messageListVisibility: messageVisibility.hide,
  },
  processing: {
    name: `${PARENT_LABEL}/Processing`,
    colorName: "yellow",
    messageListVisibility: messageVisibility.show,
  },
  processed: {
    name: `${PARENT_LABEL}/Processed`,
    colorName: "gray",
    messageListVisibility: messageVisibility.hide,
  },
  assistant: {
    name: `${PARENT_LABEL}/Assistant`,
    colorName: "purple",
    messageListVisibility: messageVisibility.show,
  },
} as const;

export type InboxZeroLabel = keyof typeof inboxZeroLabels;

export const FOLLOW_UP_LABEL = "Follow-up";

export function getLabelColor(name: string) {
  const colorName = getDefaultLabelColorName(name);
  return colorName ? labelColors[colorName] : getRandomLabelColor();
}

export function getDefaultLabelColorName(
  name: string,
): LabelColorName | undefined {
  switch (name) {
    case getRuleLabel(SystemType.MARKETING):
      return "red";
    case getRuleLabel(SystemType.NEWSLETTER):
      return "coral";
    case getRuleLabel(SystemType.NOTIFICATION):
      return "orange";
    case getRuleLabel(SystemType.RECEIPT):
      return "yellow";
    case getRuleLabel(SystemType.TO_REPLY):
      return "green";
    case getRuleLabel(SystemType.ACTIONED):
      return "cyan";
    case getRuleLabel(SystemType.AWAITING_REPLY):
      return "blue";
    case getRuleLabel(SystemType.CALENDAR):
      return "purple";
    case getRuleLabel(SystemType.OTP):
      return "cyan";
    case getRuleLabel(SystemType.COLD_EMAIL):
      return "pink";
    case getRuleLabel(SystemType.FYI):
      return "rose";
    case FOLLOW_UP_LABEL:
      return "yellow";
  }

  return Object.values(inboxZeroLabels).find((label) => label.name === name)
    ?.colorName;
}

export function getGmailDefaultLabelColor(colorName: LabelColorName) {
  return { backgroundColor: labelColors[colorName], textColor: "#000000" };
}

function getRandomLabelColor() {
  return RANDOM_LABEL_COLORS[
    Math.floor(Math.random() * RANDOM_LABEL_COLORS.length)
  ];
}
