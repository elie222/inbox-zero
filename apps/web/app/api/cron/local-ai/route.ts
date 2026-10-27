import { NextResponse } from "next/server";
import { z } from "zod";
import { withError } from "@/utils/middleware";
import { isValidInternalApiKey } from "@/utils/internal-api";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { runRules } from "@/utils/ai/choose-rule/run-rules";
import { ActionType, SystemType } from "@/generated/prisma/enums";
import {
  getRuleConfig,
  STANDARD_CATEGORY_SYSTEM_TYPES,
} from "@/utils/rule/consts";
import { upsertSystemRule } from "@/utils/rule/rule";
import { resolveLabelNameAndId } from "@/utils/label/resolve-label";
import { defaultCategory } from "@/utils/categories";
import { categorizeSender } from "@/utils/categorize/senders/categorize";
import { canonicalizeEmailAddress } from "@/utils/email";
import { internalDateToDate } from "@/utils/date";
import { tagBackfillBatch } from "@/utils/ai/choose-rule/batch-tagging";
import { getGmailClientForEmail } from "@/utils/email-account-client";
import { isGoogleProvider } from "@/utils/email/provider-types";

export const maxDuration = 300;

const bodySchema = z.object({
  operation: z.enum(["setup", "scan", "arrivals", "process", "tag-batch"]),
  emailAccountId: z.string().min(1),
  cursor: z.string().optional(),
  messageId: z.string().optional(),
  messageIds: z.array(z.string().min(1)).min(1).max(10).optional(),
  after: z.number().nonnegative().optional(),
});

// The local scheduler calls the same rule and draft pipeline used by webhooks.
// It needs neither a public tunnel nor a browser session.
export const POST = withError("cron/local-ai", async (request) => {
  if (!isValidInternalApiKey(request.headers, request.logger))
    return new Response("Unauthorized", { status: 401 });
  const body = bodySchema.parse(await request.json());
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: body.emailAccountId },
    include: {
      user: { select: { aiProvider: true, aiModel: true, aiApiKey: true } },
      account: { select: { provider: true, disconnectedAt: true } },
    },
  });
  if (!emailAccount || emailAccount.account.disconnectedAt)
    return NextResponse.json(
      { error: "Account is not connected" },
      { status: 409 },
    );
  const provider = await createEmailProvider({
    emailAccountId: emailAccount.id,
    provider: emailAccount.account.provider,
    logger: request.logger,
  });

  if (body.operation === "setup") {
    const types = [
      ...STANDARD_CATEGORY_SYSTEM_TYPES,
      SystemType.FYI,
      SystemType.AWAITING_REPLY,
      SystemType.ACTIONED,
    ];
    for (const systemType of types) {
      const config = getRuleConfig(systemType);
      let rule = await prisma.rule.findUnique({
        where: {
          emailAccountId_systemType: {
            emailAccountId: emailAccount.id,
            systemType,
          },
        },
        include: { actions: true },
      });
      if (!rule) {
        const label = await resolveLabelNameAndId({
          emailProvider: provider,
          label: config.label,
        });
        if (!label.label || !label.labelId)
          throw new Error("Could not resolve automation label");
        rule = await upsertSystemRule({
          emailAccountId: emailAccount.id,
          name: config.name,
          instructions: config.instructions,
          systemType,
          runOnThreads: config.runOnThreads,
          enabled: true,
          actions: [{ type: ActionType.LABEL, ...label }],
          logger: request.logger,
        });
      }
      if (
        systemType === SystemType.TO_REPLY &&
        !rule.actions.some((action) => action.type === ActionType.DRAFT_EMAIL)
      ) {
        await prisma.action.create({
          data: {
            type: ActionType.DRAFT_EMAIL,
            ruleId: rule.id,
            emailAccountId: emailAccount.id,
          },
        });
      }
    }
    await prisma.category.createMany({
      data: Object.values(defaultCategory).map(({ name, description }) => ({
        name,
        description,
        emailAccountId: emailAccount.id,
      })),
      skipDuplicates: true,
    });
    await prisma.emailAccount.update({
      where: { id: emailAccount.id },
      data: {
        autoCategorizeSenders: true,
        followUpAutoDraftEnabled: true,
        multiRuleSelectionEnabled: true,
        timezone: emailAccount.timezone ?? "UTC",
      },
    });
    return NextResponse.json({ configured: true, ruleCount: types.length });
  }

  if (
    body.operation === "arrivals" &&
    isGoogleProvider(emailAccount.account.provider)
  ) {
    if (body.after === undefined)
      return NextResponse.json(
        { error: "Arrival cutoff required" },
        { status: 400 },
      );
    const gmail = await getGmailClientForEmail({
      emailAccountId: emailAccount.id,
      logger: request.logger,
    });
    const page = await gmail.users.messages.list(
      {
        userId: "me",
        maxResults: 100,
        pageToken: body.cursor,
        q: `after:${Math.floor(body.after / 1000) - 1} -in:sent -in:drafts -in:spam -in:trash`,
      },
      { timeout: 10_000 },
    );
    return NextResponse.json({
      messages: (page.data.messages ?? [])
        .filter((message) => message.id && message.threadId)
        .map((message) => ({
          id: message.id!,
          threadId: message.threadId!,
          receivedAt: Date.now(),
        })),
      nextCursor: page.data.nextPageToken ?? null,
    });
  }
  if (body.operation === "scan" || body.operation === "arrivals") {
    const page = await provider.getMessagesWithPagination({
      maxResults: 10,
      pageToken: body.cursor,
      inboxOnly: false,
      includeDrafts: false,
      after: body.after === undefined ? undefined : new Date(body.after),
    });
    return NextResponse.json({
      messages: page.messages
        .filter((message) => !provider.isSentMessage(message))
        .map((message) => {
          const receivedAt = internalDateToDate(message.internalDate, {
            fallbackToNow: false,
          }).getTime();
          if (!Number.isFinite(receivedAt))
            throw new Error("Provider returned an invalid email arrival time");
          return { id: message.id, threadId: message.threadId, receivedAt };
        }),
      nextCursor: page.nextPageToken ?? null,
    });
  }

  if (body.operation === "tag-batch") {
    if (!body.messageIds)
      return NextResponse.json(
        { error: "Batch IDs required" },
        { status: 400 },
      );
    return NextResponse.json(
      await tagBackfillBatch({
        emailAccount,
        messageIds: body.messageIds,
        provider,
        logger: request.logger,
      }),
    );
  }

  if (!body.messageId)
    return NextResponse.json({ error: "Message ID required" }, { status: 400 });
  const existing = await prisma.executedRule.findFirst({
    where: {
      emailAccountId: emailAccount.id,
      messageId: body.messageId,
      status: { in: ["APPLIED", "SKIPPED", "APPLYING"] },
    },
    select: { id: true },
  });
  if (existing) return NextResponse.json({ processed: true, existing: true });
  const message = await provider.getMessage(body.messageId);
  if (provider.isSentMessage(message))
    return NextResponse.json({ processed: true, outbound: true });
  const rules = (
    await prisma.rule.findMany({
      where: { emailAccountId: emailAccount.id, enabled: true, automate: true },
      include: { actions: true },
    })
  )
    .map((rule) => ({
      ...rule,
      actions: rule.actions.filter(
        (action) =>
          action.type === ActionType.LABEL ||
          action.type === ActionType.DRAFT_EMAIL,
      ),
    }))
    .filter((rule) => rule.actions.length > 0);
  const results = await runRules({
    emailAccount,
    provider,
    message,
    rules,
    isTest: false,
    modelType: "economy",
    logger: request.logger,
    skipArchive: true,
    // Catch-up must not create new reply drafts to ancient conversations.
    skipDraftReplies:
      Date.now() - internalDateToDate(message.internalDate).getTime() >
      14 * 86_400_000,
  });
  const sender = canonicalizeEmailAddress(message.headers.from);
  if (sender && emailAccount.autoCategorizeSenders) {
    const known = await prisma.newsletter.findFirst({
      where: {
        emailAccountId: emailAccount.id,
        email: { equals: sender, mode: "insensitive" },
        categoryId: { not: null },
      },
      select: { id: true },
    });
    if (!known) await categorizeSender(sender, emailAccount, provider);
  }
  return NextResponse.json({
    processed: results.every(
      (result) => result.status === "APPLIED" || result.status === "SKIPPED",
    ),
    outcomes: results.map((result) => ({
      status: result.status,
      rule: result.rule?.name ?? null,
    })),
  });
});
