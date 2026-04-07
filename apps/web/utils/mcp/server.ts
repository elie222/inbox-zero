import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { OAuthAccessToken } from "better-auth/plugins";
import { z } from "zod";
import { getStatsByPeriod } from "@/app/api/user/stats/by-period/controller";
import { getResponseTimeStats } from "@/app/api/user/stats/response-time/controller";
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

const logger = createScopedLogger("mcp-server");
const accountSelectorShape = {
  emailAccountId: z.string().optional(),
  emailAddress: z.string().email().optional(),
};

export async function handleMcpServerRequest(
  request: Request,
  session: OAuthAccessToken,
) {
  const userId = session.userId;
  if (!userId) {
    return new Response(null, { status: 401 });
  }

  const server = new McpServer(
    { name: `${BRAND_NAME} MCP`, version: "1.0.0" },
    {
      instructions:
        "Use list_email_accounts when the user needs to target a specific inbox account. All rule and stats tools accept either emailAccountId or emailAddress and default to the first linked account.",
    },
  );

  server.registerTool(
    "list_email_accounts",
    {
      description: "List the inbox accounts linked to the authenticated user.",
    },
    async () => {
      const accounts = await listMcpEmailAccounts(userId);

      return createToolResult({ accounts });
    },
  );

  server.registerTool(
    "list_rules",
    {
      description: "List automation rules for one inbox account.",
      inputSchema: accountSelectorShape,
    },
    async (args) => {
      const emailAccount = await resolveMcpEmailAccount({ userId, ...args });
      const rules = await prisma.rule.findMany({
        where: { emailAccountId: emailAccount.id },
        select: apiRuleSelect,
        orderBy: { createdAt: "asc" },
      });

      return createToolResult({
        emailAccount,
        rules: rules.map(serializeRule),
      });
    },
  );

  server.registerTool(
    "get_rule",
    {
      description: "Get one automation rule by ID for one inbox account.",
      inputSchema: {
        ...accountSelectorShape,
        id: z.string(),
      },
    },
    async ({ id, ...args }) => {
      const emailAccount = await resolveMcpEmailAccount({ userId, ...args });
      const rule = await prisma.rule.findFirst({
        where: { id, emailAccountId: emailAccount.id },
        select: apiRuleSelect,
      });

      if (!rule) {
        throw new Error("Rule not found for the selected email account.");
      }

      return createToolResult({
        emailAccount,
        rule: serializeRule(rule),
      });
    },
  );

  server.registerTool(
    "create_rule",
    {
      description: "Create an automation rule for one inbox account.",
      inputSchema: {
        ...accountSelectorShape,
        rule: ruleRequestBodySchema,
      },
    },
    async ({ rule, ...args }) => {
      const emailAccount = await resolveMcpEmailAccount({ userId, ...args });
      const ruleInput = toRuleWriteInput(rule);
      const scopedLogger = logger.with({
        userId,
        emailAccountId: emailAccount.id,
      });

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

      return createToolResult({
        emailAccount,
        rule: serializeRule(storedRule),
      });
    },
  );

  server.registerTool(
    "update_rule",
    {
      description: "Replace an automation rule for one inbox account.",
      inputSchema: {
        ...accountSelectorShape,
        id: z.string(),
        rule: ruleRequestBodySchema,
      },
    },
    async ({ id, rule, ...args }) => {
      const emailAccount = await resolveMcpEmailAccount({ userId, ...args });
      const existingRule = await prisma.rule.findFirst({
        where: { id, emailAccountId: emailAccount.id },
        select: { id: true },
      });

      if (!existingRule) {
        throw new Error("Rule not found for the selected email account.");
      }

      const ruleInput = toRuleWriteInput(rule);
      const scopedLogger = logger.with({
        userId,
        emailAccountId: emailAccount.id,
        ruleId: id,
      });

      await updateRule({
        ruleId: id,
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
        where: { id, emailAccountId: emailAccount.id },
        select: apiRuleSelect,
      });

      return createToolResult({
        emailAccount,
        rule: updatedRule ? serializeRule(updatedRule) : null,
      });
    },
  );

  server.registerTool(
    "delete_rule",
    {
      description: "Delete an automation rule for one inbox account.",
      inputSchema: {
        ...accountSelectorShape,
        id: z.string(),
      },
    },
    async ({ id, ...args }) => {
      const emailAccount = await resolveMcpEmailAccount({ userId, ...args });
      const existingRule = await prisma.rule.findFirst({
        where: { id, emailAccountId: emailAccount.id },
        select: { groupId: true },
      });

      if (!existingRule) {
        throw new Error("Rule not found for the selected email account.");
      }

      await deleteRule({
        emailAccountId: emailAccount.id,
        ruleId: id,
        groupId: existingRule.groupId,
      });

      return createToolResult({
        deleted: true,
        emailAccount,
        id,
      });
    },
  );

  server.registerTool(
    "get_stats_by_period",
    {
      description: "Get email statistics grouped by day, week, month, or year.",
      inputSchema: {
        ...accountSelectorShape,
        period: z.enum(["day", "week", "month", "year"]).optional(),
        fromDate: z.number().int().optional(),
        toDate: z.number().int().optional(),
      },
    },
    async ({ period, fromDate, toDate, ...args }) => {
      const emailAccount = await resolveMcpEmailAccount({ userId, ...args });
      const result = await getStatsByPeriod({
        period: period ?? "week",
        fromDate,
        toDate,
        emailAccountId: emailAccount.id,
      });

      return createToolResult({
        emailAccount,
        ...result,
      });
    },
  );

  server.registerTool(
    "get_response_time_stats",
    {
      description: "Get response time analytics for one inbox account.",
      inputSchema: {
        ...accountSelectorShape,
        fromDate: z.number().int().optional(),
        toDate: z.number().int().optional(),
      },
    },
    async ({ fromDate, toDate, ...args }) => {
      const emailAccount = await resolveMcpEmailAccount({ userId, ...args });
      const scopedLogger = logger.with({
        userId,
        emailAccountId: emailAccount.id,
      });
      const emailProvider = await createEmailProvider({
        emailAccountId: emailAccount.id,
        provider: emailAccount.provider,
        logger: scopedLogger,
      });
      const result = await getResponseTimeStats({
        fromDate,
        toDate,
        emailAccountId: emailAccount.id,
        emailProvider,
        logger: scopedLogger,
      });

      return createToolResult({
        emailAccount,
        ...serializeResponseTimeStats(result),
      });
    },
  );

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);

  return transport.handleRequest(request);
}

function createToolResult(data: unknown) {
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
