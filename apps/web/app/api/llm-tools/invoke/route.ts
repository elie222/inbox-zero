import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { createRuleSchema } from "@/utils/ai/rule/create-rule-schema";
import {
  createRule,
  partialUpdateRule,
  updateRuleActions,
} from "@/utils/rule/rule";
import {
  ActionType,
  GroupItemType,
  LogicalOperator,
} from "@/generated/prisma/enums";
import { saveLearnedPatterns } from "@/utils/rule/learned-patterns";
import { filterNullProperties } from "@/utils";
import { delayInMinutesSchema } from "@/utils/actions/rule.validation";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { isDuplicateError } from "@/utils/prisma-helpers";
import {
  invokeToolRequestSchema,
  type ToolName,
  type InvokeToolResponse,
} from "./validation";

const logger = createScopedLogger("api/llm-tools/invoke");

/**
 * POST /api/llm-tools/invoke
 *
 * Thin proxy endpoint that allows Claude Code CLI skills to invoke
 * email/rule management tools. Authenticates via LLM_TOOL_PROXY_TOKEN.
 *
 * Request:
 * {
 *   tool: string,        // Tool name (e.g., "createRule")
 *   input: object,       // Tool-specific input
 *   emailAccountId: string
 * }
 *
 * Headers:
 *   Authorization: Bearer <LLM_TOOL_PROXY_TOKEN>
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Validate authorization token
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      {
        success: false,
        error: "Missing or invalid Authorization header",
        code: "UNAUTHORIZED",
      } satisfies InvokeToolResponse,
      { status: 401 },
    );
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  if (!env.LLM_TOOL_PROXY_TOKEN) {
    logger.error("LLM_TOOL_PROXY_TOKEN not configured");
    return NextResponse.json(
      {
        success: false,
        error: "Service not configured",
        code: "UNAUTHORIZED",
      } satisfies InvokeToolResponse,
      { status: 500 },
    );
  }

  // Use timing-safe comparison to prevent timing attacks
  if (token !== env.LLM_TOOL_PROXY_TOKEN) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid authorization token",
        code: "UNAUTHORIZED",
      } satisfies InvokeToolResponse,
      { status: 401 },
    );
  }

  // Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid JSON body",
        code: "VALIDATION_ERROR",
      } satisfies InvokeToolResponse,
      { status: 400 },
    );
  }

  const parseResult = invokeToolRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: `Validation error: ${parseResult.error.message}`,
        code: "VALIDATION_ERROR",
      } satisfies InvokeToolResponse,
      { status: 400 },
    );
  }

  const { tool: toolName, input, userEmail } = parseResult.data;

  // Look up email account from user email
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { email: userEmail },
    select: {
      id: true,
      email: true,
      account: {
        select: {
          provider: true,
        },
      },
    },
  });

  if (!emailAccount) {
    return NextResponse.json(
      {
        success: false,
        error: `Email account not found for: ${userEmail}`,
        code: "EMAIL_NOT_FOUND",
      } satisfies InvokeToolResponse,
      { status: 404 },
    );
  }

  const toolContext = {
    email: emailAccount.email,
    emailAccountId: emailAccount.id,
    provider: emailAccount.account.provider,
  };

  logger.info("Invoking tool", {
    tool: toolName,
    userEmail,
    emailAccountId: emailAccount.id,
    inputKeys: Object.keys(input),
  });

  // Execute the tool
  try {
    const result = await executeToolByName(toolName, input, toolContext);

    return NextResponse.json({
      success: true,
      result,
    } satisfies InvokeToolResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Tool execution failed", { tool: toolName, error: message });

    return NextResponse.json(
      {
        success: false,
        error: message,
        code: "EXECUTION_ERROR",
      } satisfies InvokeToolResponse,
      { status: 500 },
    );
  }
}

/**
 * Tool context passed to all tool handlers.
 */
interface ToolContext {
  email: string;
  emailAccountId: string;
  provider: string;
}

/**
 * Executes a tool by name with the provided input.
 * This is the dispatch function that maps tool names to their implementations.
 */
async function executeToolByName(
  toolName: ToolName,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  switch (toolName) {
    case "getUserRulesAndSettings":
      return executeGetUserRulesAndSettings(ctx);

    case "getLearnedPatterns":
      return executeGetLearnedPatterns(input as { ruleName: string }, ctx);

    case "createRule":
      return executeCreateRule(input, ctx);

    case "updateRuleConditions":
      return executeUpdateRuleConditions(input, ctx);

    case "updateRuleActions":
      return executeUpdateRuleActions(input, ctx);

    case "updateLearnedPatterns":
      return executeUpdateLearnedPatterns(input, ctx);

    case "updateAbout":
      return executeUpdateAbout(input as { about: string }, ctx);

    case "addToKnowledgeBase":
      return executeAddToKnowledgeBase(
        input as { title: string; content: string },
        ctx,
      );

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ============================================================================
// Tool Implementations
// These mirror the execute functions from utils/ai/assistant/chat.ts
// ============================================================================

async function executeGetUserRulesAndSettings(ctx: ToolContext) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: ctx.emailAccountId },
    select: {
      about: true,
      rules: {
        select: {
          name: true,
          instructions: true,
          from: true,
          to: true,
          subject: true,
          conditionalOperator: true,
          enabled: true,
          runOnThreads: true,
          actions: {
            select: {
              type: true,
              content: true,
              label: true,
              to: true,
              cc: true,
              bcc: true,
              subject: true,
              url: true,
              folderName: true,
            },
          },
        },
      },
    },
  });

  return {
    about: emailAccount?.about || "Not set",
    rules: emailAccount?.rules.map((rule) => {
      const staticFilter = filterNullProperties({
        from: rule.from,
        to: rule.to,
        subject: rule.subject,
      });

      const staticConditions =
        Object.keys(staticFilter).length > 0 ? staticFilter : undefined;

      return {
        name: rule.name,
        conditions: {
          aiInstructions: rule.instructions,
          static: staticConditions,
          conditionalOperator:
            rule.instructions && staticConditions
              ? rule.conditionalOperator
              : undefined,
        },
        actions: rule.actions.map((action) => ({
          type: action.type,
          fields: filterNullProperties({
            label: action.label,
            content: action.content,
            to: action.to,
            cc: action.cc,
            bcc: action.bcc,
            subject: action.subject,
            url: action.url,
            folderName: action.folderName,
          }),
        })),
        enabled: rule.enabled,
        runOnThreads: rule.runOnThreads,
      };
    }),
  };
}

async function executeGetLearnedPatterns(
  input: { ruleName: string },
  ctx: ToolContext,
) {
  const rule = await prisma.rule.findUnique({
    where: {
      name_emailAccountId: {
        name: input.ruleName,
        emailAccountId: ctx.emailAccountId,
      },
    },
    select: {
      group: {
        select: {
          items: {
            select: {
              type: true,
              value: true,
              exclude: true,
            },
          },
        },
      },
    },
  });

  if (!rule) {
    return {
      error:
        "Rule not found. Try listing the rules again. The user may have made changes since you last checked.",
    };
  }

  return { patterns: rule.group?.items };
}

async function executeCreateRule(
  input: Record<string, unknown>,
  ctx: ToolContext,
) {
  // Validate input against the create rule schema
  const schema = createRuleSchema(ctx.provider);
  const parseResult = schema.safeParse(input);

  if (!parseResult.success) {
    return {
      error: `Invalid input: ${parseResult.error.message}`,
    };
  }

  const { name, condition, actions } = parseResult.data;

  try {
    const rule = await createRule({
      result: {
        name,
        condition,
        actions: actions.map((action) => ({
          type: action.type,
          fields: action.fields
            ? {
                content: action.fields.content ?? null,
                to: action.fields.to ?? null,
                subject: action.fields.subject ?? null,
                label: action.fields.label ?? null,
                webhookUrl: action.fields.webhookUrl ?? null,
                cc: action.fields.cc ?? null,
                bcc: action.fields.bcc ?? null,
                ...(isMicrosoftProvider(ctx.provider) && {
                  folderName: action.fields.folderName ?? null,
                }),
              }
            : null,
        })),
      },
      emailAccountId: ctx.emailAccountId,
      provider: ctx.provider,
      runOnThreads: true,
      logger,
    });

    return { success: true, ruleId: rule.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Failed to create rule", { error });
    return { error: "Failed to create rule", message };
  }
}

async function executeUpdateRuleConditions(
  input: Record<string, unknown>,
  ctx: ToolContext,
) {
  const schema = z.object({
    ruleName: z.string(),
    condition: z.object({
      aiInstructions: z.string().optional(),
      static: z
        .object({
          from: z.string().nullish(),
          to: z.string().nullish(),
          subject: z.string().nullish(),
        })
        .nullish(),
      conditionalOperator: z
        .enum([LogicalOperator.AND, LogicalOperator.OR])
        .nullish(),
    }),
  });

  const parseResult = schema.safeParse(input);
  if (!parseResult.success) {
    return { error: `Invalid input: ${parseResult.error.message}` };
  }

  const { ruleName, condition } = parseResult.data;

  const rule = await prisma.rule.findUnique({
    where: {
      name_emailAccountId: {
        name: ruleName,
        emailAccountId: ctx.emailAccountId,
      },
    },
    select: {
      id: true,
      name: true,
      instructions: true,
      from: true,
      to: true,
      subject: true,
      conditionalOperator: true,
    },
  });

  if (!rule) {
    return {
      success: false,
      ruleId: "",
      error:
        "Rule not found. Try listing the rules again. The user may have made changes since you last checked.",
    };
  }

  const originalConditions = {
    aiInstructions: rule.instructions,
    static: filterNullProperties({
      from: rule.from,
      to: rule.to,
      subject: rule.subject,
    }),
    conditionalOperator: rule.conditionalOperator,
  };

  await partialUpdateRule({
    ruleId: rule.id,
    data: {
      instructions: condition.aiInstructions,
      from: condition.static?.from,
      to: condition.static?.to,
      subject: condition.static?.subject,
      conditionalOperator: condition.conditionalOperator ?? undefined,
    },
  });

  const updatedConditions = {
    aiInstructions: condition.aiInstructions,
    static: condition.static
      ? filterNullProperties({
          from: condition.static.from,
          to: condition.static.to,
          subject: condition.static.subject,
        })
      : undefined,
    conditionalOperator: condition.conditionalOperator,
  };

  return {
    success: true,
    ruleId: rule.id,
    originalConditions,
    updatedConditions,
  };
}

async function executeUpdateRuleActions(
  input: Record<string, unknown>,
  ctx: ToolContext,
) {
  const schema = z.object({
    ruleName: z.string(),
    actions: z.array(
      z.object({
        type: z.enum([
          ActionType.ARCHIVE,
          ActionType.LABEL,
          ActionType.DRAFT_EMAIL,
          ActionType.FORWARD,
          ActionType.REPLY,
          ActionType.SEND_EMAIL,
          ActionType.MARK_READ,
          ActionType.MARK_SPAM,
          ActionType.CALL_WEBHOOK,
          ActionType.DIGEST,
        ]),
        fields: z.object({
          label: z.string().nullish(),
          content: z.string().nullish(),
          webhookUrl: z.string().nullish(),
          to: z.string().nullish(),
          cc: z.string().nullish(),
          bcc: z.string().nullish(),
          subject: z.string().nullish(),
          folderName: z.string().nullish(),
        }),
        delayInMinutes: delayInMinutesSchema,
      }),
    ),
  });

  const parseResult = schema.safeParse(input);
  if (!parseResult.success) {
    return { error: `Invalid input: ${parseResult.error.message}` };
  }

  const { ruleName, actions } = parseResult.data;

  const rule = await prisma.rule.findUnique({
    where: {
      name_emailAccountId: {
        name: ruleName,
        emailAccountId: ctx.emailAccountId,
      },
    },
    select: {
      id: true,
      name: true,
      actions: {
        select: {
          type: true,
          content: true,
          label: true,
          to: true,
          cc: true,
          bcc: true,
          subject: true,
          url: true,
          folderName: true,
        },
      },
    },
  });

  if (!rule) {
    return {
      success: false,
      ruleId: "",
      error:
        "Rule not found. Try listing the rules again. The user may have made changes since you last checked.",
    };
  }

  const originalActions = rule.actions.map((action) => ({
    type: action.type,
    fields: filterNullProperties({
      label: action.label,
      content: action.content,
      to: action.to,
      cc: action.cc,
      bcc: action.bcc,
      subject: action.subject,
      webhookUrl: action.url,
      ...(isMicrosoftProvider(ctx.provider) && {
        folderName: action.folderName,
      }),
    }),
  }));

  await updateRuleActions({
    ruleId: rule.id,
    actions: actions.map((action) => ({
      type: action.type,
      fields: {
        label: action.fields?.label ?? null,
        to: action.fields?.to ?? null,
        cc: action.fields?.cc ?? null,
        bcc: action.fields?.bcc ?? null,
        subject: action.fields?.subject ?? null,
        content: action.fields?.content ?? null,
        webhookUrl: action.fields?.webhookUrl ?? null,
        ...(isMicrosoftProvider(ctx.provider) && {
          folderName: action.fields?.folderName ?? null,
        }),
      },
      delayInMinutes: action.delayInMinutes ?? null,
    })),
    provider: ctx.provider,
    emailAccountId: ctx.emailAccountId,
  });

  return {
    success: true,
    ruleId: rule.id,
    originalActions,
    updatedActions: actions,
  };
}

async function executeUpdateLearnedPatterns(
  input: Record<string, unknown>,
  ctx: ToolContext,
) {
  const schema = z.object({
    ruleName: z.string(),
    learnedPatterns: z
      .array(
        z.object({
          include: z
            .object({
              from: z.string().optional(),
              subject: z.string().optional(),
            })
            .optional(),
          exclude: z
            .object({
              from: z.string().optional(),
              subject: z.string().optional(),
            })
            .optional(),
        }),
      )
      .min(1, "At least one learned pattern is required"),
  });

  const parseResult = schema.safeParse(input);
  if (!parseResult.success) {
    return { error: `Invalid input: ${parseResult.error.message}` };
  }

  const { ruleName, learnedPatterns } = parseResult.data;

  const rule = await prisma.rule.findUnique({
    where: {
      name_emailAccountId: {
        name: ruleName,
        emailAccountId: ctx.emailAccountId,
      },
    },
  });

  if (!rule) {
    return {
      success: false,
      ruleId: "",
      error:
        "Rule not found. Try listing the rules again. The user may have made changes since you last checked.",
    };
  }

  const patternsToSave: Array<{
    type: GroupItemType;
    value: string;
    exclude?: boolean;
  }> = [];

  for (const pattern of learnedPatterns) {
    if (pattern.include?.from) {
      patternsToSave.push({
        type: GroupItemType.FROM,
        value: pattern.include.from,
        exclude: false,
      });
    }
    if (pattern.include?.subject) {
      patternsToSave.push({
        type: GroupItemType.SUBJECT,
        value: pattern.include.subject,
        exclude: false,
      });
    }
    if (pattern.exclude?.from) {
      patternsToSave.push({
        type: GroupItemType.FROM,
        value: pattern.exclude.from,
        exclude: true,
      });
    }
    if (pattern.exclude?.subject) {
      patternsToSave.push({
        type: GroupItemType.SUBJECT,
        value: pattern.exclude.subject,
        exclude: true,
      });
    }
  }

  if (patternsToSave.length > 0) {
    await saveLearnedPatterns({
      emailAccountId: ctx.emailAccountId,
      ruleName: rule.name,
      patterns: patternsToSave,
    });
  }

  return { success: true, ruleId: rule.id };
}

async function executeUpdateAbout(input: { about: string }, ctx: ToolContext) {
  const existing = await prisma.emailAccount.findUnique({
    where: { id: ctx.emailAccountId },
    select: { about: true },
  });

  if (!existing) {
    return { error: "Account not found" };
  }

  await prisma.emailAccount.update({
    where: { id: ctx.emailAccountId },
    data: { about: input.about },
  });

  return {
    success: true,
    previousAbout: existing.about,
    updatedAbout: input.about,
  };
}

async function executeAddToKnowledgeBase(
  input: { title: string; content: string },
  ctx: ToolContext,
) {
  try {
    await prisma.knowledge.create({
      data: {
        emailAccountId: ctx.emailAccountId,
        title: input.title,
        content: input.content,
      },
    });

    return { success: true };
  } catch (error) {
    if (isDuplicateError(error, "title")) {
      return { error: "A knowledge item with this title already exists" };
    }
    logger.error("Failed to add to knowledge base", { error });
    return { error: "Failed to add to knowledge base" };
  }
}
