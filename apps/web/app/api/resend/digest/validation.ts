import { z } from "zod";

export const storedDigestContentSchema = z.object({ content: z.string() });
export type StoredDigestContent = z.infer<typeof storedDigestContentSchema>;

const digestItemSchema = z.object({
  from: z.string(),
  subject: z.string(),
  content: z.string(),
});

const digestSchema = z.record(z.string(), z.array(digestItemSchema).optional());

export const sendDigestEmailBody = z.object({ emailAccountId: z.string() });

export type Digest = z.infer<typeof digestSchema>;
