import { z } from "zod";

export const disconnectMcpConnectionBody = z.object({
  connectionId: z.string(),
});
export type DisconnectMcpConnectionBody = z.infer<
  typeof disconnectMcpConnectionBody
>;

export const toggleMcpConnectionBody = z.object({
  connectionId: z.string(),
  isActive: z.boolean(),
});
export type ToggleMcpConnectionBody = z.infer<typeof toggleMcpConnectionBody>;

export const toggleMcpToolBody = z.object({
  toolId: z.string(),
  isEnabled: z.boolean(),
});
export type ToggleMcpToolBody = z.infer<typeof toggleMcpToolBody>;

export const testMcpSchema = z.object({
  from: z.string(),
  subject: z.string(),
  content: z.string(),
});
export type McpAgentActionInput = z.infer<typeof testMcpSchema>;
