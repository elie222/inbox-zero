import { z } from "zod";

export const connectMcpApiTokenBody = z.object({
  integration: z.string().min(1, "Integration is required"),
  name: z.string().min(1, "Connection name is required"),
  apiKey: z.string().min(1, "API key is required"),
});

export type ConnectMcpApiTokenBody = z.infer<typeof connectMcpApiTokenBody>;
