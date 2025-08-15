import { messageVisibility } from "@/utils/gmail/constants";
import {
  AWAITING_REPLY_LABEL_NAME,
  NEEDS_REPLY_LABEL_NAME,
} from "@/utils/reply-tracker/consts";

export const PARENT_LABEL = "Inbox Zero";

const blue = "#b6cff5";
const cyan = "#98d7e4";
const purple = "#e3d7ff";
const pink = "#fbd3e0";
const red = "#f2b2a8";
const coral = "#ffc8af";
const orange = "#ffdeb5";
const yellow = "#fdedc1";
const green = "#b3efd3";
const gray = "#c2c2c2";

const LABEL_COLORS = [
  blue,
  cyan,
  purple,
  pink,
  red,
  coral,
  orange,
  yellow,
  green,
] as const;

export const inboxZeroLabels = {
  cold_email: {
    name: "Cold Email",
    color: orange,
    messageListVisibility: messageVisibility.hide,
  },
  archived: {
    name: `${PARENT_LABEL}/Archived`,
    color: blue,
    messageListVisibility: messageVisibility.hide,
  },
  marked_read: {
    name: `${PARENT_LABEL}/Read`,
    color: blue,
    messageListVisibility: messageVisibility.hide,
  },
  unsubscribed: {
    name: `${PARENT_LABEL}/Unsubscribed`,
    color: red,
    messageListVisibility: messageVisibility.hide,
  },
  processing: {
    name: `${PARENT_LABEL}/Processing`,
    color: yellow,
    messageListVisibility: messageVisibility.show,
  },
  processed: {
    name: `${PARENT_LABEL}/Processed`,
    color: gray,
    messageListVisibility: messageVisibility.hide,
  },
  assistant: {
    name: `${PARENT_LABEL}/Assistant`,
    color: purple,
    messageListVisibility: messageVisibility.show,
  },
} as const;

export type InboxZeroLabel = keyof typeof inboxZeroLabels;

export function getLabelColor(name: string) {
  switch (name) {
    case NEEDS_REPLY_LABEL_NAME:
      return blue;
    case AWAITING_REPLY_LABEL_NAME:
      return green;
    case "Newsletter":
      return cyan;
    case "Marketing":
      return purple;
    case "Calendar":
      return pink;
    case "Receipt":
      return red;
    case "Notification":
      return coral;
    case "Cold Email":
      return orange;
    default:
      return getRandomLabelColor();
  }
}

function getRandomLabelColor() {
  return LABEL_COLORS[Math.floor(Math.random() * LABEL_COLORS.length)];
}
