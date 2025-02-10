import { z } from "zod";

const messageSchema = z
  .object({
    id: z.string(),
    from: z.string(),
    to: z.string(),
    subject: z.string(),
    textPlain: z.string().optional(),
    textHtml: z.string().optional(),
    date: z.string(),
  })
  .refine((data) => data.textPlain || data.textHtml, {
    message: "At least one of textPlain or textHtml is required",
  });

export const generateReplySchema = z.object({
  messages: z.array(messageSchema),
});

export type GenerateReplySchema = z.infer<typeof generateReplySchema>;
