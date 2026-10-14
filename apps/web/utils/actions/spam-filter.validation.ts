import { z } from "zod";
export const spamFilterSetting = z.object({ enabled: z.boolean() });
