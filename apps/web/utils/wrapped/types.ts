import { z } from "zod";

// Volume statistics
export const volumeStatsSchema = z.object({
  emailsReceived: z.number(),
  emailsSent: z.number(),
  totalEmails: z.number(),
});
export type VolumeStats = z.infer<typeof volumeStatsSchema>;

// Activity statistics
export const dailyActivitySchema = z.object({
  date: z.string(),
  count: z.number(),
});
export type DailyActivity = z.infer<typeof dailyActivitySchema>;

export const activityStatsSchema = z.object({
  dailyActivity: z.array(dailyActivitySchema),
  daysActive: z.number(),
  longestStreak: z.number(),
  longestBreak: z.number(),
  byDayOfWeek: z.array(
    z.object({
      day: z.string(),
      count: z.number(),
    }),
  ),
  firstEmailDate: z.string().nullable(),
  dataMonths: z.number(), // Number of months we have data for
});
export type ActivityStats = z.infer<typeof activityStatsSchema>;

// People statistics
export const topContactSchema = z.object({
  email: z.string(),
  name: z.string().nullable(),
  count: z.number(),
});
export type TopContact = z.infer<typeof topContactSchema>;

export const peopleStatsSchema = z.object({
  topContacts: z.array(topContactSchema),
  uniqueSenders: z.number(),
  uniqueRecipients: z.number(),
});
export type PeopleStats = z.infer<typeof peopleStatsSchema>;

// Response time statistics
export const responseTimeStatsSchema = z.object({
  avgResponseTimeMins: z.number().nullable(),
  fastestReplyMins: z.number().nullable(),
  fastestReplyDate: z.string().nullable(),
  totalRepliesTracked: z.number(),
});
export type ResponseTimeStats = z.infer<typeof responseTimeStatsSchema>;

// AI impact statistics
export const aiImpactStatsSchema = z.object({
  unsubscribes: z.number(),
  autoArchived: z.number(),
  autoLabeled: z.number(),
  hoursSaved: z.number(),
});
export type AIImpactStats = z.infer<typeof aiImpactStatsSchema>;

// Complete wrapped data
export const wrappedDataSchema = z.object({
  year: z.number(),
  volume: volumeStatsSchema,
  activity: activityStatsSchema,
  people: peopleStatsSchema,
  responseTime: responseTimeStatsSchema,
  aiImpact: aiImpactStatsSchema,
  generatedAt: z.string(),
});
export type WrappedData = z.infer<typeof wrappedDataSchema>;

// Constants for hours saved calculation
export const SECONDS_PER_ARCHIVE = 5;
export const SECONDS_PER_LABEL = 3;
