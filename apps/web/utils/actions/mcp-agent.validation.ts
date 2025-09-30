import { z } from "zod";

export const mcpAgentSchema = z.object({
  from: z.string(),
  subject: z.string(),
  content: z.string(),
});

export type McpAgentActionInput = z.infer<typeof mcpAgentSchema>;
