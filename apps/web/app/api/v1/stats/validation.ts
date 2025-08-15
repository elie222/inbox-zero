import { z } from "zod";

// Common date range parameters
export const dateRangeSchema = z.object({
  fromDate: z
    .string()
    .optional()
    .describe("Start date in ISO format (e.g., 2024-01-01)"),
  toDate: z
    .string()
    .optional()
    .describe("End date in ISO format (e.g., 2024-12-31)"),
});

// Summary stats query schema
export const summaryStatsQuerySchema = dateRangeSchema;

// Summary stats response schema
export const summaryStatsResponseSchema = z.object({
  received: z.number().describe("Total number of emails received"),
  read: z.number().describe("Total number of emails read"),
  archived: z.number().describe("Total number of emails archived"),
  sent: z.number().describe("Total number of emails sent"),
});

// Stats by period query schema
export const statsByPeriodQuerySchema = dateRangeSchema.extend({
  period: z
    .enum(["day", "week", "month", "year"])
    .default("week")
    .describe("Time period for grouping statistics"),
});

// Stats by period response schema
export const statsByPeriodItemSchema = z.object({
  date: z.string().describe("Period date in format based on period type"),
  received: z.number().describe("Emails received in this period"),
  read: z.number().describe("Emails read in this period"),
  archived: z.number().describe("Emails archived in this period"),
  sent: z.number().describe("Emails sent in this period"),
  unread: z.number().describe("Unread emails in this period"),
});

export const statsByPeriodResponseSchema = z.object({
  stats: z.array(statsByPeriodItemSchema),
  summary: summaryStatsResponseSchema,
});

// Newsletter stats query schema
export const newsletterStatsQuerySchema = dateRangeSchema.extend({
  limit: z
    .string()
    .optional()
    .describe("Maximum number of results to return"),
  orderBy: z
    .enum(["count", "lastReceived", "firstReceived"])
    .optional()
    .default("count")
    .describe("Field to order results by"),
});

// Newsletter stats response schema
export const newsletterItemSchema = z.object({
  name: z.string().describe("Newsletter sender name"),
  from: z.string().describe("Newsletter sender email"),
  count: z.number().describe("Number of emails received"),
  lastReceived: z.string().describe("Date of last email received"),
  readPercentage: z.number().describe("Percentage of emails read"),
  hasUnsubscribeLink: z.boolean().describe("Whether unsubscribe link is available"),
});

export const newsletterStatsResponseSchema = z.object({
  newsletters: z.array(newsletterItemSchema),
  total: z.number().describe("Total number of newsletters"),
});

// Email actions stats response schema
export const emailActionsItemSchema = z.object({
  date: z.string().describe("Date in YYYY-MM-DD format"),
  archived: z.number().describe("Number of emails archived"),
  deleted: z.number().describe("Number of emails deleted"),
});

export const emailActionsResponseSchema = z.object({
  actions: z.array(emailActionsItemSchema),
});

// Export types
export type SummaryStatsQuery = z.infer<typeof summaryStatsQuerySchema>;
export type SummaryStatsResponse = z.infer<typeof summaryStatsResponseSchema>;
export type StatsByPeriodQuery = z.infer<typeof statsByPeriodQuerySchema>;
export type StatsByPeriodResponse = z.infer<typeof statsByPeriodResponseSchema>;
export type NewsletterStatsQuery = z.infer<typeof newsletterStatsQuerySchema>;
export type NewsletterStatsResponse = z.infer<typeof newsletterStatsResponseSchema>;
export type EmailActionsResponse = z.infer<typeof emailActionsResponseSchema>;