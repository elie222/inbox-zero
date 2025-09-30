import { z } from "zod";

// Schema for testing with mock email data
export const mcpAgentSchema = z.object({
  query: z.string().min(1, "Query is required"),
  // For testing, we'll accept mock message data
  mockMessage: z
    .object({
      from: z.string().email("Invalid email address").optional(),
      subject: z.string().optional(),
      content: z.string().optional(),
    })
    .optional(),
});

export type McpAgentActionInput = z.infer<typeof mcpAgentSchema>;
