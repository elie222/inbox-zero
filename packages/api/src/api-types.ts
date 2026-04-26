export type RuleActionFields = {
  label: string | null;
  to: string | null;
  cc: string | null;
  bcc: string | null;
  subject: string | null;
  content: string | null;
  webhookUrl: string | null;
  folderName: string | null;
};

export type RuleAction = {
  type:
    | "LABEL"
    | "ARCHIVE"
    | "MARK_READ"
    | "DRAFT_EMAIL"
    | "REPLY"
    | "FORWARD"
    | "SEND_EMAIL"
    | "MARK_SPAM"
    | "DIGEST"
    | "CALL_WEBHOOK"
    | "MOVE_FOLDER"
    | "NOTIFY_MESSAGING_CHANNEL"
    | "NOTIFY_SENDER";
  fields: RuleActionFields;
  delayInMinutes: number | null;
  messagingChannelId?: string | null;
};

export type RuleCondition = {
  conditionalOperator: "AND" | "OR" | null;
  aiInstructions: string | null;
  static: {
    from: string | null;
    to: string | null;
    subject: string | null;
  };
};

export type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  runOnThreads: boolean;
  createdAt: string;
  updatedAt: string;
  condition: RuleCondition;
  actions: RuleAction[];
};

export type RulesResponse = {
  rules: Rule[];
};

export type RuleResponse = {
  rule: Rule;
};

export type NullableRuleResponse = {
  rule: Rule | null;
};

export type StatsByPeriodResponse = {
  result: Array<{
    startOfPeriod: string;
    All: number;
    Sent: number;
    Read: number;
    Unread: number;
    Unarchived: number;
    Archived: number;
  }>;
  allCount: number;
  inboxCount: number;
  readCount: number;
  sentCount: number;
};

export type ResponseTimeResponse = {
  summary: {
    medianResponseTime: number;
    averageResponseTime: number;
    within1Hour: number;
    previousPeriodComparison: {
      medianResponseTime: number;
      percentChange: number;
    } | null;
  };
  distribution: {
    lessThan1Hour: number;
    oneToFourHours: number;
    fourTo24Hours: number;
    oneToThreeDays: number;
    threeToSevenDays: number;
    moreThan7Days: number;
  };
  trend: Array<{
    period: string;
    periodDate: string;
    medianResponseTime: number;
    count: number;
  }>;
  emailsAnalyzed: number;
  maxEmailsCap: number;
};
