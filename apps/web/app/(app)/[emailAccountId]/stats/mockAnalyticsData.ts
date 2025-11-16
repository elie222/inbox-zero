import type { StatsByWeekResponse } from "@/app/api/user/stats/by-period/route";
import type { SendersResponse } from "@/app/api/user/stats/senders/route";
import type { RecipientsResponse } from "@/app/api/user/stats/recipients/route";
import type { RuleStatsResponse } from "@/app/api/user/stats/rule-stats/route";
import type { EmailActionStatsResponse } from "@/app/api/user/stats/email-actions/route";
import type { NewsletterSummaryResponse } from "@/app/api/user/stats/newsletters/summary/route";
import { NewsletterStatus } from "@prisma/client";

/**
 * Mock analytics data for testing and development
 * Use this to replace API calls in Stats component
 */

// Generate date strings for the last 30 days
function generateDateRange(days: number) {
  const dates: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    dates.push(
      date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    );
  }
  return dates;
}

// Generate week-based date range
function generateWeekRange(weeks: number) {
  const dates: string[] = [];
  const now = new Date();
  for (let i = weeks - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i * 7);
    dates.push(
      date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    );
  }
  return dates;
}

// Mock StatsByWeekResponse for StatsSummary and DetailedStats
export const mockStatsByWeek: StatsByWeekResponse = {
  result: generateWeekRange(4).map((date) => ({
    startOfPeriod: date,
    All: Math.floor(Math.random() * 500) + 200,
    Sent: Math.floor(Math.random() * 100) + 20,
    Read: Math.floor(Math.random() * 300) + 150,
    Unread: Math.floor(Math.random() * 200) + 50,
    Unarchived: Math.floor(Math.random() * 150) + 30,
    Archived: Math.floor(Math.random() * 350) + 170,
  })),
  allCount: 2847,
  inboxCount: 523,
  readCount: 1923,
  sentCount: 342,
};

// Mock SendersResponse for EmailAnalytics
export const mockSenders: SendersResponse = {
  mostActiveSenderEmails: [
    { name: "notifications@github.com", value: 234 },
    { name: "noreply@slack.com", value: 189 },
    { name: "updates@stripe.com", value: 156 },
    { name: "news@producthunt.com", value: 142 },
    { name: "team@linear.app", value: 128 },
    { name: "hello@vercel.com", value: 98 },
    { name: "support@aws.amazon.com", value: 87 },
    { name: "alerts@cloudflare.com", value: 76 },
  ],
  mostActiveSenderDomains: [
    { name: "github.com", value: 456 },
    { name: "slack.com", value: 389 },
    { name: "stripe.com", value: 312 },
    { name: "producthunt.com", value: 267 },
    { name: "linear.app", value: 234 },
    { name: "vercel.com", value: 198 },
    { name: "aws.amazon.com", value: 187 },
    { name: "cloudflare.com", value: 156 },
  ],
};

// Mock RecipientsResponse for EmailAnalytics
export const mockRecipients: RecipientsResponse = {
  mostActiveRecipientEmails: [
    { name: "team@company.com", value: 89 },
    { name: "client@example.com", value: 67 },
    { name: "partner@business.com", value: 54 },
    { name: "support@vendor.com", value: 43 },
    { name: "hello@startup.io", value: 38 },
    { name: "contact@agency.com", value: 32 },
    { name: "info@service.com", value: 28 },
    { name: "sales@provider.com", value: 24 },
  ],
};

// Mock RuleStatsResponse for RuleStatsChart
export const mockRuleStats: RuleStatsResponse = {
  ruleStats: [
    { ruleName: "Archive newsletters", executedCount: 1247 },
    { ruleName: "Auto-reply to meeting requests", executedCount: 892 },
    { ruleName: "Label important emails", executedCount: 634 },
    { ruleName: "Forward to team", executedCount: 456 },
    { ruleName: "Delete spam", executedCount: 389 },
    { ruleName: "Archive receipts", executedCount: 267 },
    { ruleName: "No Rule", executedCount: 123 },
  ],
  totalExecutedRules: 4008,
};

// Mock EmailActionStatsResponse for EmailActionsAnalytics
export const mockEmailActions: EmailActionStatsResponse = {
  result: generateDateRange(30).map((date) => ({
    date,
    Archived: Math.floor(Math.random() * 50) + 10,
    Deleted: Math.floor(Math.random() * 20) + 5,
  })),
};

// Mock NewsletterSummaryResponse for BulkUnsubscribeSummary
export const mockNewsletterSummary: NewsletterSummaryResponse = {
  result: {
    [NewsletterStatus.UNSUBSCRIBED]: 1247,
    [NewsletterStatus.AUTO_ARCHIVED]: 892,
    [NewsletterStatus.APPROVED]: 634,
  },
};

/**
 * Complete mock analytics data object
 * Use this to mock all API responses at once
 */
export const mockAnalyticsData = {
  statsByWeek: mockStatsByWeek,
  senders: mockSenders,
  recipients: mockRecipients,
  ruleStats: mockRuleStats,
  emailActions: mockEmailActions,
  newsletterSummary: mockNewsletterSummary,
};
