import prisma from "@/utils/prisma";
import type {
  AgentDocument,
  CreateAgentDocumentRequest,
  UpdateAgentDocumentRequest,
} from "../types";
import { getOrCreateAgentConfig } from "./config";

/**
 * Get all documents for an email account
 */
export async function getAgentDocuments(
  emailAccountId: string,
): Promise<AgentDocument[]> {
  const config = await prisma.agentConfig.findUnique({
    where: { emailAccountId },
    select: { id: true },
  });

  if (!config) return [];

  return prisma.agentDocument.findMany({
    where: { agentConfigId: config.id },
    orderBy: [{ type: "asc" }, { order: "asc" }],
  });
}

/**
 * Get a single document by ID
 */
export async function getAgentDocument(
  documentId: string,
  emailAccountId: string,
): Promise<AgentDocument | null> {
  const document = await prisma.agentDocument.findUnique({
    where: { id: documentId },
    include: { agentConfig: { select: { emailAccountId: true } } },
  });

  // Verify ownership
  if (document?.agentConfig.emailAccountId !== emailAccountId) {
    return null;
  }

  return document;
}

/**
 * Create a new document
 */
export async function createAgentDocument(
  emailAccountId: string,
  data: CreateAgentDocumentRequest,
): Promise<AgentDocument> {
  // Ensure config exists
  const config = await getOrCreateAgentConfig(emailAccountId);

  return prisma.agentDocument.create({
    data: {
      agentConfigId: config.id,
      title: data.title,
      content: data.content,
      type: data.type,
      enabled: data.enabled ?? true,
      order: data.order ?? 0,
    },
  });
}

/**
 * Update a document
 */
export async function updateAgentDocument(
  documentId: string,
  emailAccountId: string,
  data: UpdateAgentDocumentRequest,
): Promise<AgentDocument | null> {
  // Verify ownership first
  const existing = await getAgentDocument(documentId, emailAccountId);
  if (!existing) return null;

  return prisma.agentDocument.update({
    where: { id: documentId },
    data: {
      title: data.title,
      content: data.content,
      type: data.type,
      enabled: data.enabled,
      order: data.order,
    },
  });
}

/**
 * Delete a document
 */
export async function deleteAgentDocument(
  documentId: string,
  emailAccountId: string,
): Promise<boolean> {
  // Verify ownership first
  const existing = await getAgentDocument(documentId, emailAccountId);
  if (!existing) return false;

  await prisma.agentDocument.delete({
    where: { id: documentId },
  });

  return true;
}

/**
 * Get the main instructions document, creating a default if needed
 */
export async function getOrCreateMainDocument(
  emailAccountId: string,
): Promise<AgentDocument> {
  const config = await getOrCreateAgentConfig(emailAccountId);

  const mainDoc = await prisma.agentDocument.findFirst({
    where: {
      agentConfigId: config.id,
      type: "MAIN",
    },
  });

  if (mainDoc) return mainDoc;

  // Create default main document
  return prisma.agentDocument.create({
    data: {
      agentConfigId: config.id,
      title: "Main Instructions",
      content: `# Email Instructions

Write your email processing instructions here. The AI agent will follow these instructions when processing your emails.

## Example Instructions

- Label emails from my team with "Team"
- Archive newsletters after reading
- Draft replies to customer inquiries
- Forward invoices to accounting@company.com
`,
      type: "MAIN",
      enabled: true,
      order: 0,
    },
  });
}
