import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { processHistoryItem } from "@/utils/webhook/process-history-item";
import { ThunderbirdProvider } from "@/utils/email/thunderbird";
import {
  isValidThunderbirdBridgeRequest,
  thunderbirdInboundMessageSchema,
  thunderbirdUnauthorizedResponse,
} from "@/utils/thunderbird/auth";
import { toParsedMessageFromThunderbird } from "@/utils/thunderbird/parse-message";
import {
  clearThunderbirdProposalActions,
  listThunderbirdActions,
  saveThunderbirdMessageRef,
} from "@/utils/redis/thunderbird-actions";
import { saveThunderbirdInboxItem } from "@/utils/redis/thunderbird-inbox";
import {
  getUserTier,
  hasAiAccess,
  premiumEntitlementSelect,
} from "@/utils/premium";
import { isThunderbirdProvider } from "@/utils/email/provider-types";
import { ActionType } from "@/generated/prisma/enums";
import { suggestThunderbirdTriage } from "@/utils/ai/thunderbird/suggest-triage";
import { indexThunderbirdMessageForStats } from "@/utils/thunderbird/index-message-stats";

export const maxDuration = 300;

export const POST = withError("thunderbird/process", async (request) => {
  const logger = request.logger.with({ module: "thunderbird-bridge" });

  if (!isValidThunderbirdBridgeRequest(request, logger)) {
    return thunderbirdUnauthorizedResponse();
  }

  const body = thunderbirdInboundMessageSchema.parse(await request.json());
  const accountEmail = body.accountEmail.toLowerCase();

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { email: accountEmail },
    select: {
      id: true,
      userId: true,
      email: true,
      about: true,
      multiRuleSelectionEnabled: true,
      sensitiveDataPolicy: true,
      timezone: true,
      calendarBookingLink: true,
      draftReplyConfidence: true,
      autoCategorizeSenders: true,
      filingEnabled: true,
      filingPrompt: true,
      filingConfirmationSendEmail: true,
      account: { select: { provider: true } },
      rules: {
        where: { enabled: true },
        include: { actions: true },
      },
      user: {
        select: {
          aiProvider: true,
          aiModel: true,
          aiApiKey: true,
          premium: { select: premiumEntitlementSelect },
        },
      },
    },
  });

  if (!emailAccount) {
    return NextResponse.json(
      {
        error: `No Inbox Zero email account for ${accountEmail}. Run the Thunderbird bridge setup script first.`,
      },
      { status: 404 },
    );
  }

  if (!isThunderbirdProvider(emailAccount.account.provider)) {
    return NextResponse.json(
      {
        error: `Email account ${accountEmail} is provider=${emailAccount.account.provider}, expected thunderbird.`,
      },
      { status: 400 },
    );
  }

  // Clear leftover proposal actions so this run is clean, but keep bulk jobs.
  await clearThunderbirdProposalActions(emailAccount.id);

  const message = toParsedMessageFromThunderbird(body);
  await saveThunderbirdMessageRef(emailAccount.id, {
    messageId: message.id,
    threadId: message.threadId,
    thunderbirdMessageId: body.thunderbirdMessageId,
    thunderbirdAccountId: body.thunderbirdAccountId,
    folderPath: body.folderPath,
    folderId: body.folderId,
  });

  // Bridge re-process should re-run rules so Pending can refresh suggestions.
  await prisma.executedRule.deleteMany({
    where: {
      emailAccountId: emailAccount.id,
      messageId: message.id,
    },
  });

  const provider = new ThunderbirdProvider({
    emailAccountId: emailAccount.id,
    logger,
  });
  provider.seedMessage(message);
  await indexThunderbirdMessageForStats({
    emailAccountId: emailAccount.id,
    message,
    listUnsubscribeHeader: body.listUnsubscribe,
    logger,
  });

  const tier = getUserTier(emailAccount.user.premium);
  const hasAccess = hasAiAccess(tier, !!emailAccount.user.aiApiKey);

  await processHistoryItem(
    {
      messageId: message.id,
      threadId: message.threadId,
      message,
    },
    {
      provider,
      emailAccount,
      rules: emailAccount.rules,
      hasAutomationRules: emailAccount.rules.length > 0,
      hasAiAccess: hasAccess,
      logger,
    },
  );

  // Hold proposal actions for UI review — Thunderbird only applies after Approve.
  // Re-list then clear proposals only so bulk archive/trash jobs stay queued.
  const proposedActions = (await listThunderbirdActions(emailAccount.id)).filter(
    (action) => action.type !== "bulk_archive" && action.type !== "bulk_trash",
  );
  await clearThunderbirdProposalActions(emailAccount.id);

  const executed = await prisma.executedRule.findMany({
    where: {
      emailAccountId: emailAccount.id,
      messageId: message.id,
    },
    include: {
      rule: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const draftRulesEnabled = emailAccount.rules.some((rule) =>
    rule.actions.some((action) => action.type === ActionType.DRAFT_EMAIL),
  );

  // Tiny local models over-propose drafts. Only keep draft/reply when a draft
  // rule is actually enabled.
  let actionsForReview = draftRulesEnabled
    ? proposedActions
    : proposedActions.filter(
        (action) => action.type !== "draft" && action.type !== "reply",
      );
  const strippedDrafts =
    !draftRulesEnabled && actionsForReview.length !== proposedActions.length;

  let reason =
    executed.map((row) => row.reason).filter(Boolean).join(" · ") || undefined;

  // When rules produced nothing useful, run a focused triage classifier so
  // Pending still gets Label / Archive / Trash suggestions.
  if (actionsForReview.length === 0 && hasAccess) {
    const triage = await suggestThunderbirdTriage({
      emailAccount,
      subject: message.subject || body.subject || "(no subject)",
      from: message.headers.from || body.from || "",
      snippet: message.snippet || body.snippet,
      textPlain: message.textPlain || body.textPlain,
      messageRef: {
        messageId: message.id,
        threadId: message.threadId,
        thunderbirdMessageId: body.thunderbirdMessageId,
        thunderbirdAccountId: body.thunderbirdAccountId,
      },
      logger,
    });
    actionsForReview = triage.actions;
    reason = [reason, triage.reason].filter(Boolean).join(" · ");
    if (strippedDrafts) {
      reason = `Draft replies are disabled. ${reason}`;
    }
  } else if (actionsForReview.length === 0) {
    reason =
      reason ||
      "No AI access for triage. Use Pending quick actions to Label / Archive / Delete.";
  }

  const inboxItem = await saveThunderbirdInboxItem({
    emailAccountId: emailAccount.id,
    accountEmail,
    messageId: message.id,
    threadId: message.threadId,
    thunderbirdMessageId: body.thunderbirdMessageId,
    thunderbirdAccountId: body.thunderbirdAccountId,
    subject: message.subject || body.subject || "(no subject)",
    from: message.headers.from,
    to: message.headers.to,
    snippet: message.snippet,
    textPlain: message.textPlain || body.textPlain,
    messageDate:
      body.date ||
      (message.date instanceof Date ? message.date.toISOString() : undefined),
    ruleNames: executed
      .map((row) => row.rule?.name)
      .filter((name): name is string => Boolean(name)),
    reason,
    proposedActions: actionsForReview,
    status: "pending",
  });

  return NextResponse.json({
    ok: true,
    emailAccountId: emailAccount.id,
    messageId: message.id,
    threadId: message.threadId,
    inboxItemId: inboxItem.id,
    // Empty: actions wait for UI approve in Assistant → Pending
    actions: [],
    proposedActionCount: actionsForReview.length,
    reviewUrl: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/${emailAccount.id}/automation?tab=pending`,
  });
});
