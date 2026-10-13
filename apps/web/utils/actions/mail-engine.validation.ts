import { z } from "zod";

export const mailEngineStartupFailureBody = z.object({
  errorName: z.string().max(100),
  errorMessage: z.string().max(1000),
});
