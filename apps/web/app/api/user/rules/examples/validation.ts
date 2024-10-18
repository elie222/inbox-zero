import { z } from "zod";

export const rulesExamplesQuery = z.object({
  rulesPrompt: z.string(),
});
export type RulesExamplesQuery = z.infer<typeof rulesExamplesQuery>;
