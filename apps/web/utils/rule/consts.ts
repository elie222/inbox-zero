import { DEFAULT_COLD_EMAIL_PROMPT } from "@/utils/cold-email/prompt";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { ActionType, SystemType } from "@prisma/client";

const ruleConfig: Record<
  SystemType,
  {
    name: string;
    instructions: string;
    label: string;
    draftReply?: boolean;
    runOnThreads: boolean;
    categoryAction: "label" | "label_archive" | "move_folder";
    categoryActionMicrosoft?: "move_folder";
    tooltipText: string;
  }
> = {
  [SystemType.TO_REPLY]: {
    name: "To Reply",
    instructions: "Emails you need to respond to",
    label: "To Reply",
    draftReply: true,
    runOnThreads: true,
    categoryAction: "label",
    tooltipText:
      "Emails you need to reply to and those where you're awaiting a reply. The label will update automatically as the conversation progresses",
  },
  [SystemType.FYI]: {
    name: "FYI",
    instructions: "Emails that don't require your response, but are important",
    label: "FYI",
    runOnThreads: true,
    categoryAction: "label",
    tooltipText: "",
  },
  [SystemType.AWAITING_REPLY]: {
    name: "Awaiting Reply",
    instructions: "Emails you're expecting a reply to",
    label: "Awaiting Reply",
    runOnThreads: true,
    categoryAction: "label",
    tooltipText: "",
  },
  [SystemType.ACTIONED]: {
    name: "Actioned",
    instructions: "Email threads that have been resolved",
    label: "Actioned",
    runOnThreads: true,
    categoryAction: "label",
    tooltipText: "",
  },
  [SystemType.NEWSLETTER]: {
    name: "Newsletter",
    instructions:
      "Newsletters: Regular content from publications, blogs, or services I've subscribed to",
    label: "Newsletter",
    runOnThreads: false,
    categoryAction: "label",
    categoryActionMicrosoft: "move_folder",
    tooltipText: "Newsletters, blogs, and publications",
  },
  [SystemType.MARKETING]: {
    name: "Marketing",
    instructions:
      "Marketing: Promotional emails about products, services, sales, or offers",
    label: "Marketing",
    runOnThreads: false,
    categoryAction: "label_archive",
    categoryActionMicrosoft: "move_folder",
    tooltipText: "Promotional emails about sales and offers",
  },
  [SystemType.CALENDAR]: {
    name: "Calendar",
    instructions:
      "Calendar: Any email related to scheduling, meeting invites, or calendar notifications",
    label: "Calendar",
    runOnThreads: false,
    categoryAction: "label",
    tooltipText: "Events, appointments, and reminders",
  },
  [SystemType.RECEIPT]: {
    name: "Receipt",
    instructions:
      "Receipts: Purchase confirmations, payment receipts, transaction records or invoices",
    label: "Receipt",
    runOnThreads: false,
    categoryAction: "label",
    categoryActionMicrosoft: "move_folder",
    tooltipText: "Invoices, receipts, and payments",
  },
  [SystemType.NOTIFICATION]: {
    name: "Notification",
    instructions: "Notifications: Alerts, status updates, or system messages",
    label: "Notification",
    runOnThreads: false,
    categoryAction: "label",
    categoryActionMicrosoft: "move_folder",
    tooltipText: "Alerts, status updates, and system messages",
  },
  [SystemType.COLD_EMAIL]: {
    name: "Cold Email",
    instructions: DEFAULT_COLD_EMAIL_PROMPT,
    label: "Cold Email",
    runOnThreads: false,
    categoryAction: "label_archive",
    categoryActionMicrosoft: "move_folder",
    tooltipText:
      "Unsolicited sales pitches and cold emails. We'll never block someone that's emailed you before",
  },
};

export function getRuleConfig(systemType: SystemType) {
  if (!ruleConfig[systemType])
    throw new Error(`Invalid system type: ${systemType}`);
  return ruleConfig[systemType];
}

export function getRuleName(systemType: SystemType) {
  return getRuleConfig(systemType).name;
}

export function getRuleLabel(systemType: SystemType) {
  return getRuleConfig(systemType).label;
}

export function getCategoryAction(systemType: SystemType, provider: string) {
  const config = getRuleConfig(systemType);

  if (isMicrosoftProvider(provider)) {
    return config.categoryActionMicrosoft || config.categoryAction;
  }

  return config.categoryAction;
}

export const SYSTEM_RULE_ORDER: SystemType[] = [
  SystemType.TO_REPLY,
  SystemType.FYI,
  SystemType.AWAITING_REPLY,
  SystemType.ACTIONED,
  SystemType.NEWSLETTER,
  SystemType.MARKETING,
  SystemType.CALENDAR,
  SystemType.RECEIPT,
  SystemType.NOTIFICATION,
  SystemType.COLD_EMAIL,
];

export function getDefaultActions(
  systemType: SystemType,
  provider: string,
): Array<{
  id: string;
  type: ActionType;
  label: string | null;
  labelId: string | null;
  to: string | null;
  subject: string | null;
  content: string | null;
  ruleId: string;
  folderId: string | null;
  folderName: string | null;
  url: string | null;
  cc: string | null;
  bcc: string | null;
  delayInMinutes: number | null;
  createdAt: Date;
  updatedAt: Date;
}> {
  const config = getRuleConfig(systemType);
  const categoryAction = getCategoryAction(systemType, provider);
  const now = new Date();
  const actions: Array<{
    id: string;
    type: ActionType;
    label: string | null;
    labelId: string | null;
    to: string | null;
    subject: string | null;
    content: string | null;
    ruleId: string;
    folderId: string | null;
    folderName: string | null;
    url: string | null;
    cc: string | null;
    bcc: string | null;
    delayInMinutes: number | null;
    createdAt: Date;
    updatedAt: Date;
  }> = [];

  if (categoryAction === "move_folder") {
    actions.push({
      id: `placeholder-action-folder-${systemType}`,
      type: ActionType.MOVE_FOLDER,
      folderName: config.label,
      label: null,
      labelId: null,
      to: null,
      subject: null,
      content: null,
      ruleId: `placeholder-${systemType}`,
      folderId: null,
      url: null,
      cc: null,
      bcc: null,
      delayInMinutes: null,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    actions.push({
      id: `placeholder-action-label-${systemType}`,
      type: ActionType.LABEL,
      label: config.label,
      labelId: null,
      to: null,
      subject: null,
      content: null,
      ruleId: `placeholder-${systemType}`,
      folderId: null,
      folderName: null,
      url: null,
      cc: null,
      bcc: null,
      delayInMinutes: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (categoryAction === "label_archive") {
    actions.push({
      id: `placeholder-action-archive-${systemType}`,
      type: ActionType.ARCHIVE,
      label: null,
      labelId: null,
      to: null,
      subject: null,
      content: null,
      ruleId: `placeholder-${systemType}`,
      folderId: null,
      folderName: null,
      url: null,
      cc: null,
      bcc: null,
      delayInMinutes: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (config.draftReply) {
    actions.push({
      id: `placeholder-action-draft-${systemType}`,
      type: ActionType.DRAFT_EMAIL,
      label: null,
      labelId: null,
      to: null,
      subject: null,
      content: null,
      ruleId: `placeholder-${systemType}`,
      folderId: null,
      folderName: null,
      url: null,
      cc: null,
      bcc: null,
      delayInMinutes: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  return actions;
}

export function getSystemRuleActionTypes(
  systemType: SystemType,
  provider: string,
): Array<{
  type: ActionType;
  includeLabel?: boolean;
  includeFolder?: boolean;
}> {
  const config = getRuleConfig(systemType);
  const categoryAction = getCategoryAction(systemType, provider);
  const actionTypes: Array<{
    type: ActionType;
    includeLabel?: boolean;
    includeFolder?: boolean;
  }> = [];

  if (categoryAction === "move_folder") {
    actionTypes.push({ type: ActionType.MOVE_FOLDER, includeFolder: true });
  } else {
    actionTypes.push({ type: ActionType.LABEL, includeLabel: true });
  }

  if (categoryAction === "label_archive") {
    actionTypes.push({ type: ActionType.ARCHIVE });
  }

  if (config.draftReply) {
    actionTypes.push({ type: ActionType.DRAFT_EMAIL });
  }

  return actionTypes;
}
