import { assertCanUseDigestsIfNeeded } from "@/utils/premium/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { getStatsByPeriod } from "@/app/api/user/stats/by-period/controller";
import { getResponseTimeStats } from "@/utils/stats/response-time/controller";
import { toRuleWriteInput } from "@/app/api/v1/rules/request";
import { apiRuleSelect, serializeRule } from "@/app/api/v1/rules/serializers";
import { ruleRequestBodySchema } from "@/app/api/v1/rules/validation";
import { BRAND_NAME } from "@/utils/branding";
import { createEmailProvider } from "@/utils/email/provider";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { createRule, deleteRule, updateRule } from "@/utils/rule/rule";
import {
  listMcpEmailAccounts,
  resolveMcpEmailAccount,
} from "@/utils/mcp/account-selection";
import type { MCP_SCOPES } from "@/utils/mcp/config";
import { isMcpServerEnabledForUser } from "@/utils/mcp/access";
import {
  createDraftForMcp,
  createDraftInputShape,
  mcpAccountSelectorShape,
  readThreadForMcp,
  readThreadInputShape,
  searchInboxForMcp,
  searchInboxInputShape,
} from "@/utils/mcp/email-tools";

const logger = createScopedLogger("mcp-server");
type ToolResultData = Record<string, unknown>;
const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};
const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
};
const destructiveAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
};
const mailboxReadAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true,
};
const mailboxWriteAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: true,
};

export async function handleMcpServerRequest(
  request: Request,
  session: { userId: string; scopes: string[]; clientId?: string },
) {
  const userId = session.userId;
  if (!userId) {
    return new Response(null, { status: 401 });
  }

  if (!(await isMcpServerEnabledForUser(userId))) {
    return new Response(null, { status: 403 });
  }

  const toolLogger = logger.with({
    userId,
    ...(session.clientId ? { clientId: session.clientId } : {}),
  });

  const server = new McpServer(
    { name: `${BRAND_NAME} MCP`, version: "1.0.0" },
    {
      instructions:
        "Use list_email_accounts when targeting a specific inbox. Search and read tools return mail; create_draft saves a mailbox draft and never sends. Rule and stats tools accept emailAccountId or emailAddress and default to the first linked account.",
    },
  );

  const runTool =
    (
      name: string,
      required: (typeof MCP_SCOPES)[number],
      handler: (args: Record<string, unknown>) => Promise<ToolResultData>,
    ) =>
    async (args: Record<string, unknown>) => {
      try {
        assertMcpScope(session.scopes, required);
        const data = await handler(args);
        toolLogger.info("MCP tool call", {
          tool: name,
          ...emailAccountLogFields(data),
        });
        return createToolResult(data);
      } catch (error) {
        toolLogger.warn("MCP tool failed", {
          tool: name,
          error: error instanceof Error ? error.message : error,
        });
        throw error;
      }
    };

  server.registerTool(
    "list_email_accounts",
    {
      title: "List email accounts",
      description: "List the inbox accounts linked to the authenticated user.",
      annotations: readOnlyAnnotations,
    },
    runTool("list_email_accounts", "mcp:read", async () => ({
      accounts: await listMcpEmailAccounts(userId),
    })),
  );

  server.registerTool(
    "search_inbox",
    {
      title: "Search inbox",
      description:
        "Search one inbox and return message metadata and snippets. Use read_thread for full bodies. Does not send or change mail.",
      inputSchema: searchInboxInputShape,
      annotations: mailboxReadAnnotations,
    },
    runTool("search_inbox", "mcp:read", async (args) =>
      searchInboxForMcp({
        userId,
        query: String(args.query),
        maxResults:
          typeof args.maxResults === "number" ? args.maxResults : undefined,
        pageToken:
          typeof args.pageToken === "string" ? args.pageToken : undefined,
        emailAccountId:
          typeof args.emailAccountId === "string"
            ? args.emailAccountId
            : undefined,
        emailAddress:
          typeof args.emailAddress === "string" ? args.emailAddress : undefined,
        logger: toolLogger,
      }),
    ),
  );

  server.registerTool(
    "read_thread",
    {
      title: "Read thread",
      description:
        "Read messages in a thread. Returns plain-text bodies truncated per message. Use search_inbox to find threadId.",
      inputSchema: readThreadInputShape,
      annotations: mailboxReadAnnotations,
    },
    runTool("read_thread", "mcp:read", async (args) =>
      readThreadForMcp({
        userId,
        threadId: String(args.threadId),
        maxMessages:
          typeof args.maxMessages === "number" ? args.maxMessages : undefined,
        emailAccountId:
          typeof args.emailAccountId === "string"
            ? args.emailAccountId
            : undefined,
        emailAddress:
          typeof args.emailAddress === "string" ? args.emailAddress : undefined,
        logger: toolLogger,
      }),
    ),
  );

  server.registerTool(
    "create_draft",
    {
      title: "Create draft",
      description:
        "Create a mailbox draft. This does not send. Prefer this over inventing a send action; sending is not available.",
      inputSchema: createDraftInputShape,
      annotations: mailboxWriteAnnotations,
    },
    runTool("create_draft", "mcp:write", async (args) =>
      createDraftForMcp({
        userId,
        to: String(args.to),
        subject: String(args.subject),
        body: String(args.body),
        emailAccountId:
          typeof args.emailAccountId === "string"
            ? args.emailAccountId
            : undefined,
        emailAddress:
          typeof args.emailAddress === "string" ? args.emailAddress : undefined,
        logger: toolLogger,
      }),
    ),
  );

  server.registerTool(
    "list_rules",
    {
      title: "List rules",
      description: "List automation rules for one inbox account.",
      inputSchema: mcpAccountSelectorShape,
      annotations: readOnlyAnnotations,
    },
    runTool("list_rules", "mcp:read", async (args) => {
      const emailAccount = await resolveMcpEmailAccount({
        userId,
        ...accountSelector(args),
      });
      const rules = await prisma.rule.findMany({
        where: { emailAccountId: emailAccount.id },
        select: apiRuleSelect,
        orderBy: { createdAt: "asc" },
      });

      return {
        emailAccount,
        rules: rules.map(serializeRule),
      };
    }),
  );

  server.registerTool(
    "get_rule",
    {
      title: "Get rule",
      description: "Get one automation rule by ID for one inbox account.",
      inputSchema: {
        ...mcpAccountSelectorShape,
        id: z.string(),
      },
      annotations: readOnlyAnnotations,
    },
    runTool("get_rule", "mcp:read", async (args) => {
      const emailAccount = await resolveMcpEmailAccount({
        userId,
        ...accountSelector(args),
      });
      const rule = await prisma.rule.findFirst({
        where: { id: String(args.id), emailAccountId: emailAccount.id },
        select: apiRuleSelect,
      });

      if (!rule) {
        throw new Error("Rule not found for the selected email account.");
      }

      return {
        emailAccount,
        rule: serializeRule(rule),
      };
    }),
  );

  server.registerTool(
    "create_rule",
    {
      title: "Create rule",
      description: "Create an automation rule for one inbox account.",
      inputSchema: {
        ...mcpAccountSelectorShape,
        rule: ruleRequestBodySchema,
      },
      annotations: writeAnnotations,
    },
    runTool("create_rule", "mcp:write", async (args) => {
      const emailAccount = await resolveMcpEmailAccount({
        userId,
        ...accountSelector(args),
      });
      const ruleInput = toRuleWriteInput(
        ruleRequestBodySchema.parse(args.rule),
      );
      const scopedLogger = toolLogger.with({
        emailAccountId: emailAccount.id,
      });

      await assertCanUseDigestsIfNeeded(userId, ruleInput.actions);

      const createdRule = await createRule({
        result: {
          name: ruleInput.name,
          condition: ruleInput.condition,
          actions: ruleInput.actions,
        },
        emailAccountId: emailAccount.id,
        provider: emailAccount.provider,
        runOnThreads: ruleInput.runOnThreads,
        logger: scopedLogger,
      });

      const storedRule = await prisma.rule.findUnique({
        where: { id: createdRule.id },
        select: apiRuleSelect,
      });

      if (!storedRule) {
        throw new Error("Created rule could not be loaded.");
      }

      return {
        emailAccount,
        rule: serializeRule(storedRule),
      };
    }),
  );

  server.registerTool(
    "update_rule",
    {
      title: "Update rule",
      description: "Replace an automation rule for one inbox account.",
      inputSchema: {
        ...mcpAccountSelectorShape,
        id: z.string(),
        rule: ruleRequestBodySchema,
      },
      annotations: writeAnnotations,
    },
    runTool("update_rule", "mcp:write", async (args) => {
      const emailAccount = await resolveMcpEmailAccount({
        userId,
        ...accountSelector(args),
      });
      const existingRule = await prisma.rule.findFirst({
        where: { id: String(args.id), emailAccountId: emailAccount.id },
        select: { id: true, actions: { select: { type: true } } },
      });

      if (!existingRule) {
        throw new Error("Rule not found for the selected email account.");
      }

      const ruleInput = toRuleWriteInput(
        ruleRequestBodySchema.parse(args.rule),
      );
      const scopedLogger = toolLogger.with({
        emailAccountId: emailAccount.id,
        ruleId: String(args.id),
      });

      await assertCanUseDigestsIfNeeded(
        userId,
        ruleInput.actions,
        existingRule.actions,
      );

      await updateRule({
        ruleId: String(args.id),
        result: {
          name: ruleInput.name,
          condition: ruleInput.condition,
          actions: ruleInput.actions,
        },
        emailAccountId: emailAccount.id,
        provider: emailAccount.provider,
        logger: scopedLogger,
        runOnThreads: ruleInput.runOnThreads,
      });

      const updatedRule = await prisma.rule.findFirst({
        where: { id: String(args.id), emailAccountId: emailAccount.id },
        select: apiRuleSelect,
      });

      if (!updatedRule) {
        throw new Error("Updated rule could not be loaded.");
      }

      return {
        emailAccount,
        rule: serializeRule(updatedRule),
      };
    }),
  );

  server.registerTool(
    "delete_rule",
    {
      title: "Delete rule",
      description: "Delete an automation rule for one inbox account.",
      inputSchema: {
        ...mcpAccountSelectorShape,
        id: z.string(),
      },
      annotations: destructiveAnnotations,
    },
    runTool("delete_rule", "mcp:write", async (args) => {
      const emailAccount = await resolveMcpEmailAccount({
        userId,
        ...accountSelector(args),
      });
      const existingRule = await prisma.rule.findFirst({
        where: { id: String(args.id), emailAccountId: emailAccount.id },
        select: { groupId: true },
      });

      if (!existingRule) {
        throw new Error("Rule not found for the selected email account.");
      }

      await deleteRule({
        emailAccountId: emailAccount.id,
        ruleId: String(args.id),
        groupId: existingRule.groupId,
      });

      return {
        deleted: true,
        emailAccount,
        id: String(args.id),
      };
    }),
  );

  server.registerTool(
    "get_stats_by_period",
    {
      title: "Get stats by period",
      description: "Get email statistics grouped by day, week, month, or year.",
      inputSchema: {
        ...mcpAccountSelectorShape,
        period: z.enum(["day", "week", "month", "year"]).optional(),
        fromDate: z.number().int().optional(),
        toDate: z.number().int().optional(),
      },
      annotations: readOnlyAnnotations,
    },
    runTool("get_stats_by_period", "mcp:read", async (args) => {
      const emailAccount = await resolveMcpEmailAccount({
        userId,
        ...accountSelector(args),
      });
      const result = await getStatsByPeriod({
        period:
          args.period === "day" ||
          args.period === "week" ||
          args.period === "month" ||
          args.period === "year"
            ? args.period
            : "week",
        fromDate: typeof args.fromDate === "number" ? args.fromDate : undefined,
        toDate: typeof args.toDate === "number" ? args.toDate : undefined,
        emailAccountId: emailAccount.id,
      });

      return {
        emailAccount,
        ...result,
      };
    }),
  );

  server.registerTool(
    "get_response_time_stats",
    {
      title: "Get response time stats",
      description: "Get response time analytics for one inbox account.",
      inputSchema: {
        ...mcpAccountSelectorShape,
        fromDate: z.number().int().optional(),
        toDate: z.number().int().optional(),
      },
      annotations: readOnlyAnnotations,
    },
    runTool("get_response_time_stats", "mcp:read", async (args) => {
      const emailAccount = await resolveMcpEmailAccount({
        userId,
        ...accountSelector(args),
      });
      const scopedLogger = toolLogger.with({
        emailAccountId: emailAccount.id,
      });
      const emailProvider = await createEmailProvider({
        emailAccountId: emailAccount.id,
        provider: emailAccount.provider,
        logger: scopedLogger,
      });
      const result = await getResponseTimeStats({
        fromDate: typeof args.fromDate === "number" ? args.fromDate : undefined,
        toDate: typeof args.toDate === "number" ? args.toDate : undefined,
        emailAccountId: emailAccount.id,
        emailProvider,
        logger: scopedLogger,
      });

      return {
        emailAccount,
        ...serializeResponseTimeStats(result),
      };
    }),
  );

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);

  return transport.handleRequest(request);
}

function createToolResult(data: ToolResultData) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

function serializeResponseTimeStats(
  result: Awaited<ReturnType<typeof getResponseTimeStats>>,
) {
  return {
    ...result,
    trend: result.trend.map((entry) => ({
      ...entry,
      periodDate: entry.periodDate.toISOString(),
    })),
  };
}

function assertMcpScope(
  scopes: string[],
  required: (typeof MCP_SCOPES)[number],
) {
  if (!scopes.includes(required))
    throw new Error(`Missing required permission: ${required}`);
}

function accountSelector(args: Record<string, unknown>) {
  return {
    emailAccountId:
      typeof args.emailAccountId === "string" ? args.emailAccountId : undefined,
    emailAddress:
      typeof args.emailAddress === "string" ? args.emailAddress : undefined,
  };
}

function emailAccountLogFields(data: ToolResultData) {
  const emailAccount = data.emailAccount;
  if (
    !emailAccount ||
    typeof emailAccount !== "object" ||
    !("id" in emailAccount) ||
    typeof emailAccount.id !== "string"
  ) {
    return {};
  }
  return { emailAccountId: emailAccount.id };
}
