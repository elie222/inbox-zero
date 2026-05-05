import { z } from "zod";

export const digestContentSchema = z.object({
  narrativeGreeting: z
    .string()
    .describe(
      "Short greeting like 'Morning, Rebekah —' or holiday-flavored variant",
    ),
  narrativeBody: z
    .string()
    .describe(
      "3-4 sentence personal-assistant overview, italic in template; humor allowed unless any item is grief/illness/legal/distress",
    ),
  urgent: z.array(
    z.object({
      messageId: z.string(),
      summary: z
        .string()
        .describe(
          "Professional, no humor. ≤25 words. Why it's urgent + what's needed.",
        ),
    }),
  ),
  uncertain: z.array(
    z.object({
      messageId: z.string(),
      summary: z
        .string()
        .describe("≤25 words. Why classifier hesitated; what would help."),
    }),
  ),
  autoFiled: z.object({
    receipts: z.array(
      z.object({
        label: z
          .string()
          .describe("Cluster noun: 'Starbucks', 'Fuel', 'Amazon'"),
        summary: z
          .string()
          .describe("Cluster summary, can be playful, ≤30 words"),
        memberMessageIds: z.array(z.string()),
      }),
    ),
    newsletters: z.array(
      z.object({
        label: z.string(),
        summary: z.string(),
        memberMessageIds: z.array(z.string()),
      }),
    ),
    marketing: z.array(
      z.object({
        label: z
          .string()
          .describe(
            "If promotional: prefix 'Deals — '. E.g. 'Deals — outdoor', 'Deals — software'",
          ),
        summary: z.string(),
        memberMessageIds: z.array(z.string()),
      }),
    ),
    notifications: z.array(
      z.object({
        label: z.string(),
        summary: z.string(),
        memberMessageIds: z.array(z.string()),
      }),
    ),
  }),
});

export type DigestContent = z.infer<typeof digestContentSchema>;
