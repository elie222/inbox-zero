import { z } from "zod";

export const syncMcpToolsBody = z.object({
  connectionId: z.string().min(1, "Connection ID is required"),
});
export type SyncMcpToolsBody = z.infer<typeof syncMcpToolsBody>;

export const callMcpToolBody = z.object({
  name: z.string().min(1, "Tool name is required"),
  args: z.record(z.unknown()).optional().default({}),
});
export type CallMcpToolBody = z.infer<typeof callMcpToolBody>;

export const connectMcpBody = z.object({
  integrationName: z.string().min(1, "Integration name is required"),
  name: z.string().min(1, "Connection name is required"),
  apiKey: z.string().optional(),
});
export type ConnectMcpBody = z.infer<typeof connectMcpBody>;

export const disconnectMcpBody = z.object({
  integrationName: z.string().min(1, "Integration name is required"),
});
export type DisconnectMcpBody = z.infer<typeof disconnectMcpBody>;
