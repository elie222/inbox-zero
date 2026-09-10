import { z } from "zod";

export const updateEmailOtpBody = z.object({ enabled: z.boolean() });
