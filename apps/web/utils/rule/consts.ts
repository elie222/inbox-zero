import { DEFAULT_COLD_EMAIL_PROMPT } from "@/utils/cold-email/prompt";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { ActionType, SystemType } from "@/generated/prisma/enums";
import { env } from "@/env";

export const STANDARD_CATEGORY_SYSTEM_TYPES = [
  SystemType.TO_REPLY,
  SystemType.NEWSLETTER,
  SystemType.MARKETING,
  SystemType.CALENDAR,
  SystemType.RECEIPT,
  SystemType.NOTIFICATION,
  SystemType.COLD_EMAIL,
] as const;

/** Inbox tabs for enabled label-only rules. Includes opt-in types that onboarding does not create. */
export const DEFAULT_MAIL_SPLIT_SYSTEM_TYPES = [
  ...STANDARD_CATEGORY_SYSTEM_TYPES,
  SystemType.OTP,
] as const;

/** Owned prompts we do not seed, placeholder, or leave as disabled Rules rows. */
export const OPT_IN_SYSTEM_TYPES = [SystemType.OTP] as const;

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
    shouldLearn: boolean;
    /**
     * Earlier default `instructions` for this rule. Rules store their
     * instructions at creation, so a row holding one of these is still on the
     * default, not customised.
     */
    previousInstructions?: readonly string[];
  }
> = {
  [SystemType.TO_REPLY]: {
    name: "To Reply",
    instructions:
      "Emails I need to respond to: someone asked me a question or requested something from me, or I promised to send something and haven't yet",
    previousInstructions: ["Emails I need to respond to"],
    label: "To Reply",
    draftReply: true,
    runOnThreads: true,
    categoryAction: "label",
    tooltipText:
      "Emails you need to reply to and those where you're awaiting a reply. The label will update automatically as the conversation progresses",
    shouldLearn: false,
  },
  [SystemType.AWAITING_REPLY]: {
    name: "Awaiting Reply",
    instructions:
      "Emails where I'm waiting for someone to get back to me: I asked for or requested something and the other person hasn't answered or delivered it yet",
    previousInstructions: [
      "Emails where I'm waiting for someone to get back to me",
    ],
    label: "Awaiting Reply",
    runOnThreads: true,
    categoryAction: "label",
    tooltipText: "",
    shouldLearn: false,
  },
  [SystemType.FYI]: {
    name: "FYI",
    instructions:
      "Important emails I should know about, but don't need to reply to: information, updates or announcements sent to me, with no question or request anywhere in the thread",
    previousInstructions: [
      "Important emails I should know about, but don't need to reply to",
    ],
    label: "FYI",
    runOnThreads: true,
    categoryAction: "label",
    tooltipText: "",
    shouldLearn: false,
  },
  [SystemType.ACTIONED]: {
    name: "Actioned",
    instructions:
      "Conversations that are done, nothing left to do: every question has been answered, every request fulfilled or taken care of, and nobody is waiting on anyone",
    previousInstructions: ["Conversations that are done, nothing left to do"],
    label: "Actioned",
    runOnThreads: true,
    categoryAction: "label",
    tooltipText: "",
    shouldLearn: false,
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
    shouldLearn: true,
  },
  [SystemType.MARKETING]: {
    name: "Marketing",
    instructions:
      "Marketing: Promotions, sales, and offers that can be safely archived. Exclude emails whose main purpose is account access, a transaction, or a service update, even if they include promotional content.",
    label: "Marketing",
    runOnThreads: false,
    categoryAction: "label_archive",
    categoryActionMicrosoft: "move_folder",
    tooltipText: "Promotional emails about sales and offers",
    shouldLearn: true,
  },
  [SystemType.CALENDAR]: {
    name: "Calendar",
    instructions:
      "Calendar: Any email related to scheduling, meeting invites, or calendar notifications",
    label: "Calendar",
    runOnThreads: false,
    categoryAction: "label",
    tooltipText: "Events, appointments, and reminders",
    shouldLearn: true,
  },
  [SystemType.RECEIPT]: {
    name: "Receipt",
    instructions:
      "Receipts: Purchase confirmations, payment receipts, card charge notices, invoices or other records of money I paid",
    previousInstructions: [
      "Receipts: Purchase confirmations, payment receipts, transaction records or invoices",
    ],
    label: "Receipt",
    runOnThreads: false,
    categoryAction: "label",
    categoryActionMicrosoft: "move_folder",
    tooltipText: "Invoices, receipts, and payments",
    shouldLearn: true,
  },
  [SystemType.NOTIFICATION]: {
    name: "Notification",
    instructions: "Notifications: Alerts, status updates, or system messages",
    label: "Notification",
    runOnThreads: false,
    categoryAction: "label",
    categoryActionMicrosoft: "move_folder",
    tooltipText: "Alerts, status updates, and system messages",
    shouldLearn: true,
  },
  [SystemType.OTP]: {
    name: "OTP",
    instructions:
      "OTP: One-time passwords, 2FA/MFA codes, email verification codes, and magic sign-in or password-reset links.",
    label: "OTP",
    runOnThreads: false,
    categoryAction: "label",
    tooltipText: "One-time passwords, 2FA codes, and sign-in links",
    shouldLearn: true,
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
    shouldLearn: true,
  },
};

export function getRuleConfig(systemType: SystemType) {
  if (!ruleConfig[systemType])
    throw new Error(`Invalid system type: ${systemType}`);
  return ruleConfig[systemType];
}

/**
 * Whether a rule's stored instructions are still a default, current or
 * previous. Empty instructions count as default.
 */
export function isDefaultRuleInstructions(
  systemType: SystemType,
  instructions: string | null | undefined,
) {
  if (!instructions) return true;
  const config = getRuleConfig(systemType);
  return (
    instructions === config.instructions ||
    (config.previousInstructions?.includes(instructions) ?? false)
  );
}

export function getRuleName(systemType: SystemType) {
  return getRuleConfig(systemType).name;
}

export function getRuleLabel(systemType: SystemType) {
  return getRuleConfig(systemType).label;
}

export function shouldLearnFromLabelRemoval(systemType: SystemType): boolean {
  return getRuleConfig(systemType).shouldLearn;
}

export function isEligibleForClassificationFeedback(
  systemType: SystemType | null | undefined,
): boolean {
  if (!systemType) return true;
  return getRuleConfig(systemType).shouldLearn;
}

export function getCategoryAction(systemType: SystemType, provider: string) {
  const config = getRuleConfig(systemType);

  if (isMicrosoftProvider(provider)) {
    return config.categoryActionMicrosoft || config.categoryAction;
  }

  return config.categoryAction;
}

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
  messagingChannelId: string | null;
  delayInMinutes: number | null;
  staticAttachments: null;
  integrationName: string | null;
  integrationToolName: string | null;
  integrationArgs: null;
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
    messagingChannelId: string | null;
    delayInMinutes: number | null;
    staticAttachments: null;
    integrationName: string | null;
    integrationToolName: string | null;
    integrationArgs: null;
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
      messagingChannelId: null,
      delayInMinutes: null,
      staticAttachments: null,
      integrationName: null,
      integrationToolName: null,
      integrationArgs: null,
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
      messagingChannelId: null,
      delayInMinutes: null,
      staticAttachments: null,
      integrationName: null,
      integrationToolName: null,
      integrationArgs: null,
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
      messagingChannelId: null,
      delayInMinutes: null,
      staticAttachments: null,
      integrationName: null,
      integrationToolName: null,
      integrationArgs: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (config.draftReply && !env.NEXT_PUBLIC_AUTO_DRAFT_DISABLED) {
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
      messagingChannelId: null,
      delayInMinutes: null,
      staticAttachments: null,
      integrationName: null,
      integrationToolName: null,
      integrationArgs: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  return actions;
}

type ActionTypeConfig = {
  type: ActionType;
  includeLabel?: boolean;
  includeFolder?: boolean;
};

export function getActionTypesForCategoryAction({
  categoryAction,
  systemType,
  draftReply = false,
  hasDigest = false,
}: {
  categoryAction: "label" | "label_archive" | "move_folder";
  systemType?: SystemType;
  draftReply?: boolean;
  hasDigest?: boolean;
}): ActionTypeConfig[] {
  const actionTypes: ActionTypeConfig[] = [];

  if (categoryAction === "move_folder") {
    actionTypes.push({ type: ActionType.MOVE_FOLDER, includeFolder: true });
  } else {
    actionTypes.push({ type: ActionType.LABEL, includeLabel: true });
  }

  if (categoryAction === "label_archive") {
    actionTypes.push({ type: ActionType.ARCHIVE });

    if (
      systemType === SystemType.COLD_EMAIL &&
      env.NEXT_PUBLIC_IS_RESEND_CONFIGURED
    ) {
      actionTypes.push({ type: ActionType.NOTIFY_SENDER });
    }
  }

  if (draftReply && !env.NEXT_PUBLIC_AUTO_DRAFT_DISABLED) {
    actionTypes.push({ type: ActionType.DRAFT_EMAIL });
  }

  if (hasDigest) {
    actionTypes.push({ type: ActionType.DIGEST });
  }

  return actionTypes;
}

export function getSystemRuleActionTypes(
  systemType: SystemType,
  provider: string,
): ActionTypeConfig[] {
  const config = getRuleConfig(systemType);
  const categoryAction = getCategoryAction(systemType, provider);

  return getActionTypesForCategoryAction({
    categoryAction,
    systemType,
    draftReply: config.draftReply,
  });
}

export function isOptInSystemType(
  systemType: string | null | undefined,
): boolean {
  return (
    !!systemType &&
    (OPT_IN_SYSTEM_TYPES as readonly string[]).includes(systemType)
  );
}
