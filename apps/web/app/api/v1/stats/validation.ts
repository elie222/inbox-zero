import { z } from "zod";
import { zodPeriod } from "@inboxzero/tinybird";

export const statsQuerySchema = z.object({
  fromDate: z.coerce
    .number()
    .optional()
    .describe("Start date as Unix timestamp"),
  toDate: z.coerce.number().optional().describe("End date as Unix timestamp"),
  email: z
    .string()
    .optional()
    .describe(
      "Email account to get stats for (if not provided, uses the first account)",
    ),
});

// Summary stats schema
export const summaryStatsQuerySchema = z.object({
  period: zodPeriod
    .optional()
    .default("week")
    .describe("Time period for aggregation"),
  fromDate: z.coerce
    .number()
    .optional()
    .describe("Start date as Unix timestamp"),
  toDate: z.coerce.number().optional().describe("End date as Unix timestamp"),
  email: z
    .string()
    .optional()
    .describe(
      "Email account to get stats for (if not provided, uses the first account)",
    ),
});

export const summaryStatsResponseSchema = z.object({
  result: z
    .array(
      z.object({
        startOfPeriod: z.string().describe("Start date of the period"),
        All: z.number().describe("Total emails"),
        Sent: z.number().describe("Emails sent"),
        Read: z.number().describe("Emails read"),
        Unread: z.number().describe("Emails unread"),
        Unarchived: z.number().describe("Emails in inbox"),
        Archived: z.number().describe("Emails archived"),
      }),
    )
    .describe("Statistics broken down by time period"),
  allCount: z.number().describe("Total count of all emails"),
  inboxCount: z.number().describe("Total count of emails in inbox"),
  readCount: z.number().describe("Total count of read emails"),
  sentCount: z.number().describe("Total count of sent emails"),
});

// Day stats schema
export const dayStatsQuerySchema = z.object({
  type: z
    .enum(["sent", "archived", "inbox"])
    .describe("Type of email statistics to retrieve"),
  email: z
    .string()
    .optional()
    .describe(
      "Email account to get stats for (if not provided, uses the first account)",
    ),
});

export const dayStatsResponseSchema = z
  .array(
    z.object({
      date: z.string().describe("Date in YYYY-MM-DD format"),
      Emails: z.number().describe("Number of emails for this date"),
    }),
  )
  .describe("Daily email statistics for the past 7 days");

export type SummaryStatsResponse = z.infer<typeof summaryStatsResponseSchema>;
export type DayStatsResponse = z.infer<typeof dayStatsResponseSchema>;
