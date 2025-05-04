import { z } from "zod";

export const replyTrackerQuerySchema = z.object({
  type: z.enum(["needs-reply", "needs-follow-up"]),
  page: z.number().optional().default(1),
  timeRange: z.enum(["all", "3d", "1w", "2w", "1m"]).optional().default("all"),
  email: z.string().optional(),
});

export const replyTrackerResponseSchema = z.object({
  emails: z.array(
    z.object({
      threadId: z.string().describe("Thread ID"),
      subject: z.string().describe("Subject"),
      from: z.string().describe("From"),
      date: z.string().describe("Date"),
      snippet: z.string().describe("Preview snippet of the email content"),
    }),
  ),
  count: z.number().describe("Total number of emails needing reply"),
});
export type ReplyTrackerResponse = z.infer<typeof replyTrackerResponseSchema>;
