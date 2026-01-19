import prisma from "@/utils/prisma";
import type {
  AgentConfig,
  AgentConfigWithDocuments,
  AgentConfigWithAll,
  UpdateAgentConfigRequest,
} from "../types";

/**
 * Get agent config for an email account
 */
export async function getAgentConfig(
  emailAccountId: string,
): Promise<AgentConfigWithDocuments | null> {
  return prisma.agentConfig.findUnique({
    where: { emailAccountId },
    include: {
      documents: {
        where: { enabled: true },
        orderBy: [{ type: "asc" }, { order: "asc" }],
      },
    },
  });
}

/**
 * Get agent config with all related data (documents + memories)
 */
export async function getAgentConfigWithAll(
  emailAccountId: string,
): Promise<AgentConfigWithAll | null> {
  return prisma.agentConfig.findUnique({
    where: { emailAccountId },
    include: {
      documents: {
        orderBy: [{ type: "asc" }, { order: "asc" }],
      },
      memories: {
        orderBy: { updatedAt: "desc" },
      },
    },
  });
}

/**
 * Get or create agent config for an email account
 * Creates with default settings if doesn't exist
 */
export async function getOrCreateAgentConfig(
  emailAccountId: string,
): Promise<AgentConfigWithDocuments> {
  const existing = await getAgentConfig(emailAccountId);
  if (existing) return existing;

  return prisma.agentConfig.create({
    data: {
      emailAccountId,
      enabled: false,
      // Default permissions
      canLabel: true,
      canArchive: true,
      canDraftReply: true,
      canMarkRead: true,
      canWebSearch: false,
      canCreateLabel: false,
      forwardAllowList: [],
    },
    include: {
      documents: {
        where: { enabled: true },
        orderBy: [{ type: "asc" }, { order: "asc" }],
      },
    },
  });
}

/**
 * Update agent config
 */
export async function updateAgentConfig(
  emailAccountId: string,
  data: UpdateAgentConfigRequest,
): Promise<AgentConfig> {
  // Ensure config exists first
  await getOrCreateAgentConfig(emailAccountId);

  return prisma.agentConfig.update({
    where: { emailAccountId },
    data: {
      enabled: data.enabled,
      canLabel: data.canLabel,
      canArchive: data.canArchive,
      canDraftReply: data.canDraftReply,
      canMarkRead: data.canMarkRead,
      canWebSearch: data.canWebSearch,
      canCreateLabel: data.canCreateLabel,
      forwardAllowList: data.forwardAllowList,
    },
  });
}

/**
 * Check if agent mode is enabled for an email account
 */
export async function isAgentEnabled(emailAccountId: string): Promise<boolean> {
  const config = await prisma.agentConfig.findUnique({
    where: { emailAccountId },
    select: { enabled: true },
  });
  return config?.enabled ?? false;
}
