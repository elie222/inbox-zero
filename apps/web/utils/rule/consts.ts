import { DEFAULT_COLD_EMAIL_PROMPT } from "@/utils/cold-email/prompt";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { SystemType } from "@prisma/client";

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
  [SystemType.AWAITING_REPLY]: {
    name: "Awaiting Reply",
    instructions: "Emails you're expecting a reply to",
    label: "Awaiting Reply",
    runOnThreads: true,
    categoryAction: "label",
    tooltipText: "",
  },
  [SystemType.FYI]: {
    name: "FYI",
    instructions: "Emails that don't require your response, but are important",
    label: "FYI",
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
