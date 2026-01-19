import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailAccount } from "@/utils/middleware";
import {
  getAgentDocument,
  updateAgentDocument,
  deleteAgentDocument,
  type AgentDocument,
  type UpdateAgentDocumentRequest,
} from "@/providers/email-agent";

export type AgentDocumentResponse = AgentDocument | null;

const updateDocumentSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  content: z.string().optional(),
  type: z.enum(["MAIN", "SKILL"]).optional(),
  enabled: z.boolean().optional(),
  order: z.number().optional(),
});

export const GET = withEmailAccount(
  "user/agent/documents/[documentId]",
  async (request, { params }) => {
    const emailAccountId = request.auth.emailAccountId;
    const { documentId } = await params;

    const document = await getAgentDocument(documentId, emailAccountId);

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(document);
  },
);

export const PUT = withEmailAccount(
  "user/agent/documents/[documentId]",
  async (request, { params }) => {
    const emailAccountId = request.auth.emailAccountId;
    const { documentId } = await params;
    const body = await request.json();

    const result = updateDocumentSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: result.error.flatten() },
        { status: 400 },
      );
    }

    const data: UpdateAgentDocumentRequest = result.data;
    const document = await updateAgentDocument(
      documentId,
      emailAccountId,
      data,
    );

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(document);
  },
);

export const DELETE = withEmailAccount(
  "user/agent/documents/[documentId]",
  async (request, { params }) => {
    const emailAccountId = request.auth.emailAccountId;
    const { documentId } = await params;

    const deleted = await deleteAgentDocument(documentId, emailAccountId);

    if (!deleted) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  },
);
