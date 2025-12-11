import { z } from "zod";

export const responseTimeQuerySchema = z.object({
  fromDate: z.coerce.number().optional(),
  toDate: z.coerce.number().optional(),
  email: z.string().optional(),
});

export const responseTimeResponseSchema = z.object({
  summary: z.object({
    medianResponseTime: z.number(),
    averageResponseTime: z.number(),
    within1Hour: z.number(),
    previousPeriodComparison: z
      .object({
        medianResponseTime: z.number(),
        percentChange: z.number(),
      })
      .nullable(),
  }),
  distribution: z.object({
    lessThan1Hour: z.number(),
    oneToFourHours: z.number(),
    fourTo24Hours: z.number(),
    oneToThreeDays: z.number(),
    threeToSevenDays: z.number(),
    moreThan7Days: z.number(),
  }),
  trend: z.array(
    z.object({
      period: z.string(),
      periodDate: z.coerce.date(),
      medianResponseTime: z.number(),
      count: z.number(),
    }),
  ),
  emailsAnalyzed: z.number(),
  maxEmailsCap: z.number(),
});

export type ResponseTimeResult = z.infer<typeof responseTimeResponseSchema>;
