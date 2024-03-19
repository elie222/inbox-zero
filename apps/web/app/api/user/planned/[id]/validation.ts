import { z } from "zod";
import { actEmailWithHtml } from "@/app/api/ai/act/validation";

export const executePlanBody = z.object({ email: actEmailWithHtml });
export type ExecutePlanBody = z.infer<typeof executePlanBody>;
