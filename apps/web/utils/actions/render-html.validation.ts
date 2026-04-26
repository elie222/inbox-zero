import { z } from "zod";

export const renderHtmlBody = z.object({
  html: z.string(),
});
