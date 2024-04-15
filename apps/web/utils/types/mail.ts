import { z } from "zod";

export const zodAttachment = z.object({
  filename: z.string(),
  content: z.string(),
  contentType: z.string(),
});
export type Attachment = z.infer<typeof zodAttachment>;
