import { z } from "zod";

export const disconnectMcpConnectionBody = z.object({
  connectionId: z.string(),
});
export type DisconnectMcpConnectionBody = z.infer<
  typeof disconnectMcpConnectionBody
>;

export const toggleMcpToolBody = z.object({
  toolId: z.string(),
  isEnabled: z.boolean(),
});
export type ToggleMcpToolBody = z.infer<typeof toggleMcpToolBody>;
