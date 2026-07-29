import { z } from "zod";

export const recallWebhookPayloadSchema = z.object({
  event: z.string(),
  data: z.object({
    data: z
      .object({
        code: z.string().optional(),
        sub_code: z.string().nullish(),
      })
      .optional(),
    bot: z.object({ id: z.string() }).optional(),
    transcript: z.object({ id: z.string() }).optional(),
    recording: z.object({ id: z.string() }).optional(),
  }),
});

export type RecallWebhookPayload = z.infer<typeof recallWebhookPayloadSchema>;

export const recallBotSchema = z.object({
  id: z.string(),
  status_changes: z
    .array(z.object({ code: z.string(), sub_code: z.string().nullish() }))
    .optional(),
});

export const recallTranscriptSchema = z.object({
  id: z.string(),
  data: z.object({ download_url: z.string().nullish() }).nullish(),
});

// The downloaded transcript JSON: one entry per participant turn, each holding
// individually timed words.
export const recallTranscriptDownloadSchema = z.array(
  z.object({
    participant: z.object({
      id: z.union([z.string(), z.number()]).nullish(),
      name: z.string().nullish(),
      is_host: z.boolean().nullish(),
      email: z.string().nullish(),
    }),
    words: z.array(
      z.object({
        text: z.string(),
        start_timestamp: z.object({ relative: z.number().nullish() }).nullish(),
        end_timestamp: z.object({ relative: z.number().nullish() }).nullish(),
      }),
    ),
  }),
);

export type RecallTranscriptDownload = z.infer<
  typeof recallTranscriptDownloadSchema
>;
