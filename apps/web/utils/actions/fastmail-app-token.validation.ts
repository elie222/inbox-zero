import { z } from "zod";

export const linkFastmailAppTokenBody = z.object({
  appToken: z.string().min(1, "App token is required"),
});

export type LinkFastmailAppTokenBody = z.infer<typeof linkFastmailAppTokenBody>;
