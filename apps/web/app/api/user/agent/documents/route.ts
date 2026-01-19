import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailAccount } from "@/utils/middleware";
import {
  getAgentDocuments,
  createAgentDocument,
  getOrCreateMainDocument,
  type AgentDocument,
  type CreateAgentDocumentRequest,
} from "@/providers/email-agent";

export type AgentDocumentsResponse = AgentDocument[];

const createDocumentSchema = z.object({
  title: z.string().min(1).max(100),
  content: z.string(),
  type: z.enum(["MAIN", "SKILL"]),
  enabled: z.boolean().optional(),
  order: z.number().optional(),
});

export const GET = withEmailAccount("user/agent/documents", async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  // Check if we need to create default main document
  const url = new URL(request.url);
  const ensureMain = url.searchParams.get("ensureMain") === "true";

  if (ensureMain) {
    await getOrCreateMainDocument(emailAccountId);
  }

  const documents = await getAgentDocuments(emailAccountId);
  return NextResponse.json(documents);
});

export const POST = withEmailAccount(
  "user/agent/documents",
  async (request) => {
    const emailAccountId = request.auth.emailAccountId;
    const body = await request.json();

    const result = createDocumentSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: result.error.flatten() },
        { status: 400 },
      );
    }

    const data: CreateAgentDocumentRequest = result.data;
    const document = await createAgentDocument(emailAccountId, data);

    return NextResponse.json(document, { status: 201 });
  },
);
