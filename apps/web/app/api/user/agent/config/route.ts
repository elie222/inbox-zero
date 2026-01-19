import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailAccount } from "@/utils/middleware";
import {
  getOrCreateAgentConfig,
  updateAgentConfig,
  type AgentConfigWithDocuments,
  type UpdateAgentConfigRequest,
} from "@/providers/email-agent";

export type AgentConfigResponse = AgentConfigWithDocuments;

const updateConfigSchema = z.object({
  enabled: z.boolean().optional(),
  canLabel: z.boolean().optional(),
  canArchive: z.boolean().optional(),
  canDraftReply: z.boolean().optional(),
  canMarkRead: z.boolean().optional(),
  canWebSearch: z.boolean().optional(),
  canCreateLabel: z.boolean().optional(),
  forwardAllowList: z.array(z.string().email()).optional(),
});

export const GET = withEmailAccount("user/agent/config", async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const config = await getOrCreateAgentConfig(emailAccountId);
  return NextResponse.json(config);
});

export const PUT = withEmailAccount("user/agent/config", async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const body = await request.json();

  const result = updateConfigSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: result.error.flatten() },
      { status: 400 },
    );
  }

  const data: UpdateAgentConfigRequest = result.data;
  const config = await updateAgentConfig(emailAccountId, data);

  return NextResponse.json(config);
});
