// The default names we give to rules in our database. The user can edit these
export const RuleName: Record<SystemRule, string> = {
  ToReply: "To Reply",
  AwaitingReply: "Awaiting Reply",
  Fyi: "FYI",
  Actioned: "Actioned",
  Newsletter: "Newsletter",
  Marketing: "Marketing",
  Calendar: "Calendar",
  Receipt: "Receipt",
  Notification: "Notification",
  ColdEmail: "Cold Email",
};

export const SystemRule = {
  ToReply: "To Reply",
  AwaitingReply: "Awaiting Reply",
  Fyi: "FYI",
  Actioned: "Actioned",
  Newsletter: "Newsletter",
  Marketing: "Marketing",
  Calendar: "Calendar",
  Receipt: "Receipt",
  Notification: "Notification",
  ColdEmail: "Cold Email",
};
export type SystemRule = (typeof SystemRule)[keyof typeof SystemRule];

export const ruleConfig: Record<
  SystemRule,
  {
    name: string;
    instructions: string;
    label: string;
    draftReply?: boolean;
    runOnThreads: boolean;
    categoryAction: "label" | "label_archive" | "move_folder";
    categoryActionMicrosoft?: "move_folder";
  }
> = {
  [SystemRule.ToReply]: {
    name: "To Reply",
    instructions: "Emails you need to respond to",
    label: "To Reply",
    draftReply: true,
    runOnThreads: true,
    categoryAction: "label",
  },
  [SystemRule.AwaitingReply]: {
    name: "Awaiting Reply",
    instructions: "Emails you're expecting a reply to",
    label: "Awaiting Reply",
    runOnThreads: true,
    categoryAction: "label",
  },
  [SystemRule.Fyi]: {
    name: "FYI",
    instructions: "Emails that don't require your response, but are important",
    label: "FYI",
    runOnThreads: true,
    categoryAction: "label",
  },
  [SystemRule.Actioned]: {
    name: "Actioned",
    instructions: "Email threads that have been resolved",
    label: "Actioned",
    runOnThreads: true,
    categoryAction: "label",
  },
  [SystemRule.Newsletter]: {
    name: "Newsletter",
    instructions:
      "Newsletters: Regular content from publications, blogs, or services I've subscribed to",
    label: "Newsletter",
    runOnThreads: false,
    categoryAction: "label",
    categoryActionMicrosoft: "move_folder",
  },
  [SystemRule.Marketing]: {
    name: "Marketing",
    instructions:
      "Marketing: Promotional emails about products, services, sales, or offers",
    label: "Marketing",
    runOnThreads: false,
    categoryAction: "label_archive",
    categoryActionMicrosoft: "move_folder",
  },
  [SystemRule.Calendar]: {
    name: "Calendar",
    instructions:
      "Calendar: Any email related to scheduling, meeting invites, or calendar notifications",
    label: "Calendar",
    runOnThreads: false,
    categoryAction: "label",
  },
  [SystemRule.Receipt]: {
    name: "Receipt",
    instructions:
      "Receipts: Purchase confirmations, payment receipts, transaction records or invoices",
    label: "Receipt",
    runOnThreads: false,
    categoryAction: "label",
    categoryActionMicrosoft: "move_folder",
  },
  [SystemRule.Notification]: {
    name: "Notification",
    instructions: "Notifications: Alerts, status updates, or system messages",
    label: "Notification",
    runOnThreads: false,
    categoryAction: "label",
    categoryActionMicrosoft: "move_folder",
  },
  [SystemRule.ColdEmail]: {
    name: "Cold Email",
    instructions: "",
    label: "Cold Email",
    runOnThreads: false,
    categoryAction: "label_archive",
    categoryActionMicrosoft: "move_folder",
  },
};
