import { listMcpTools } from "@/utils/mcp/list-tools";
import {
  resolveMcpIntegration,
  type ResolvedMcpIntegration,
} from "@/utils/mcp/resolve-integration";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import type { Prisma } from "@/generated/prisma/client";

// Custom servers have no curated allowlist, so cap what a single server can store
const MAX_CUSTOM_TOOLS = 50;
const MAX_CUSTOM_TOOL_DESCRIPTION_LENGTH = 1000;

export async function syncMcpTools(
  integrationName: string,
  emailAccountId: string,
  log: Logger,
) {
  const integration = await resolveMcpIntegration({
    name: integrationName,
    emailAccountId,
  });
  if (!integration) {
    throw new Error(`Unknown integration: ${integrationName}`);
  }

  const logger = log.with({ integration: integrationName, emailAccountId });

  logger.info("Syncing MCP tools");

  try {
    const mcpConnection = await prisma.mcpConnection.findFirst({
      where: {
        emailAccountId,
        integration: {
          name: integrationName,
        },
        isActive: true,
      },
      include: {
        integration: true,
        tools: { select: { name: true, isEnabled: true } },
      },
    });

    if (!mcpConnection) {
      throw new Error(`No active connection found for ${integrationName}`);
    }

    const allTools = await listMcpTools(integration, emailAccountId);

    const existingEnabledByName = new Map(
      mcpConnection.tools.map((tool) => [tool.name, tool.isEnabled]),
    );

    const tools = integration.isCustom
      ? buildCustomTools(allTools, existingEnabledByName, logger)
      : buildBuiltInTools(integration, allTools, existingEnabledByName, logger);

    logger.info("Fetched and filtered tools from MCP server", {
      totalToolsAvailable: allTools.length,
      storedToolsCount: tools.length,
    });

    // Replace stored tools, preserving the user's enable/disable choices for
    // tools that already existed
    await prisma.$transaction([
      prisma.mcpTool.deleteMany({
        where: { connectionId: mcpConnection.id },
      }),
      ...(tools.length > 0
        ? [
            prisma.mcpTool.createMany({
              data: tools.map((tool) => ({
                connectionId: mcpConnection.id,
                name: tool.name,
                description: tool.description,
                schema: tool.inputSchema as Prisma.InputJsonValue,
                isEnabled: tool.isEnabled,
                isWrite: tool.isWrite,
              })),
            }),
          ]
        : []),
    ]);

    logger.info("Successfully synced MCP tools", {
      connectionId: mcpConnection.id,
      toolsStored: tools.length,
    });

    return {
      success: true,
      toolsCount: tools.length,
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
      })),
    };
  } catch (error) {
    logger.error("Failed to sync MCP tools", { error });

    throw new Error(
      `Failed to sync tools: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

type ListedTool = Awaited<ReturnType<typeof listMcpTools>>[number];
type StoredTool = ListedTool & { isWrite: boolean; isEnabled: boolean };

function buildBuiltInTools(
  integration: ResolvedMcpIntegration,
  allTools: ListedTool[],
  existingEnabledByName: Map<string, boolean>,
  logger: Logger,
): StoredTool[] {
  const writeToolNames = integration.ruleActionWriteTools ?? [];
  const writeTools = allTools.filter((tool) =>
    writeToolNames.includes(tool.name),
  );

  // Everything that isn't a write tool is a read tool, narrowed to the
  // config's allowlist when it declares one
  const allowedToolNames = integration.allowedTools;
  let readTools = allTools.filter(
    (tool) =>
      !writeToolNames.includes(tool.name) &&
      (!allowedToolNames || allowedToolNames.includes(tool.name)),
  );

  // Pipedream exposes a changing tool catalog. Require both its annotation
  // and the operation name to indicate a read before storing the tool.
  if (integration.filterWriteTools) {
    const beforeCount = readTools.length;
    readTools = readTools.filter(
      (tool) => tool.readOnlyHint === true && isReadOnlyTool(tool.name),
    );
    logger.info("Filtered write tools", {
      before: beforeCount,
      after: readTools.length,
      filtered: beforeCount - readTools.length,
    });
  }

  return [
    ...readTools.map((tool) => ({
      ...tool,
      isWrite: false,
      isEnabled:
        existingEnabledByName.get(tool.name) ?? !integration.filterWriteTools,
    })),
    ...writeTools.map((tool) => ({
      ...tool,
      isWrite: true,
      isEnabled:
        existingEnabledByName.get(tool.name) ?? !integration.filterWriteTools,
    })),
  ];
}

function buildCustomTools(
  allTools: ListedTool[],
  existingEnabledByName: Map<string, boolean>,
  logger: Logger,
): StoredTool[] {
  if (allTools.length > MAX_CUSTOM_TOOLS) {
    logger.warn("Custom MCP server exposes more tools than we store", {
      available: allTools.length,
      stored: MAX_CUSTOM_TOOLS,
    });
  }

  // Keep annotated read-only tools when the cap drops the rest: they are the
  // only ones that start enabled
  const prioritized = [
    ...allTools.filter((tool) => tool.readOnlyHint === true),
    ...allTools.filter((tool) => tool.readOnlyHint !== true),
  ];

  // Custom tools never run as rule actions, so they are never write tools.
  // Only tools the server annotates as read-only start enabled.
  return prioritized.slice(0, MAX_CUSTOM_TOOLS).map((tool) => ({
    ...tool,
    description: tool.description?.slice(0, MAX_CUSTOM_TOOL_DESCRIPTION_LENGTH),
    isWrite: false,
    isEnabled:
      existingEnabledByName.get(tool.name) ?? tool.readOnlyHint === true,
  }));
}

// Read-only action verbs - check if the second segment matches
const READ_ONLY_ACTIONS = [
  "get",
  "retrieve",
  "find",
  "search",
  "list",
  "fetch",
  "read",
  "query",
  "describe",
  "lookup",
  "view",
  "show",
];

/**
 * Checks if a tool name indicates a read-only operation.
 * Tool names follow pattern: "app-action-target" (e.g., "slack_v2-list-channels")
 */
export function isReadOnlyTool(toolName: string): boolean {
  const parts = toolName.toLowerCase().split("-");
  if (parts.length < 2) return false;

  const action = parts[1];
  return READ_ONLY_ACTIONS.includes(action);
}
