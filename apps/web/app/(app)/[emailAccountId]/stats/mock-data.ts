import type { EmailActionStatsResponse } from "@/app/api/user/stats/email-actions/route";
import type { RuleStatsResponse } from "@/app/api/user/stats/rule-stats/route";

export const MOCK_RULE_STATS: RuleStatsResponse = {
  ruleStats: [
    { ruleName: "Auto-archive newsletters", executedCount: 156 },
    { ruleName: "Label marketing emails", executedCount: 89 },
    { ruleName: "Forward to team", executedCount: 45 },
    { ruleName: "Archive old threads", executedCount: 32 },
    { ruleName: "Draft reply to customers", executedCount: 28 },
  ],
  totalExecutedRules: 350,
};

export const MOCK_EMAIL_ACTIONS: EmailActionStatsResponse = {
  result: [
    { date: "2024-11-12", Archived: 45, Deleted: 23 },
    { date: "2024-11-13", Archived: 67, Deleted: 31 },
    { date: "2024-11-14", Archived: 52, Deleted: 18 },
    { date: "2024-11-15", Archived: 89, Deleted: 42 },
    { date: "2024-11-16", Archived: 71, Deleted: 27 },
    { date: "2024-11-17", Archived: 34, Deleted: 15 },
    { date: "2024-11-18", Archived: 58, Deleted: 29 },
    { date: "2024-11-19", Archived: 76, Deleted: 38 },
  ],
};
