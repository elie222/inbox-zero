import { GroupItemType } from "@prisma/client";
import { z } from "zod";

export const groupEmailsQuerySchema = z.object({
  pageToken: z.string().optional(),
  from: z.coerce.number().optional(),
  to: z.coerce.number().optional(),
  email: z.string().optional(),
});

export const groupEmailsResponseSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string(),
      threadId: z.string(),
      labelIds: z.array(z.string()).optional(),
      snippet: z.string(),
      historyId: z.string(),
      attachments: z.array(z.object({})).optional(),
      inline: z.array(z.object({})),
      headers: z.object({}),
      textPlain: z.string().optional(),
      textHtml: z.string().optional(),
      matchingGroupItem: z
        .object({
          id: z.string(),
          type: z.enum([
            GroupItemType.FROM,
            GroupItemType.SUBJECT,
            GroupItemType.BODY,
          ]),
          value: z.string(),
        })
        .nullish(),
    }),
  ),
  nextPageToken: z.string().optional(),
});
export type GroupEmailsResult = z.infer<typeof groupEmailsResponseSchema>;
