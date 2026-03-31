import type { Block, KnownBlock } from "@slack/types";
import {
  ActionType,
  MessagingProvider,
  ScheduledActionStatus,
} from "@/generated/prisma/enums";
import type { ScheduledAction } from "@/generated/prisma/client";
import { createEmailProvider } from "@/utils/email/provider";
import type { Logger } from "@/utils/logger";
import { createSlackClient } from "@/utils/messaging/providers/slack/client";
import {
  postMessageWithJoin,
  resolveSlackDestination,
} from "@/utils/messaging/providers/slack/send";
import prisma from "@/utils/prisma";
import { removeExcessiveWhitespace, truncate } from "@/utils/string";
import {
  cancelAwaitingConfirmationScheduledAction,
  markAwaitingConfirmationActionAsExecuting,
  markScheduledActionAwaitingConfirmation,
  revertScheduledActionAwaitingConfirmation,
} from "./scheduler";
import {
  executeScheduledAction,
  finalizeExecutedRuleIfNoPendingActions,
} from "./executor";

const PREVIEW_MAX_CHARS = 600;

export const SCHEDULED_ACTION_APPROVE_ACTION_ID = "saae";
export const SCHEDULED_ACTION_REJECT_ACTION_ID = "saar";

type ApprovalEligibleScheduledAction = Pick<
  ScheduledAction,
  | "id"
  | "actionType"
  | "content"
  | "subject"
  | "to"
  | "scheduledFor"
  | "emailAccountId"
>;

type SlackApprovalRequestResult =
  | { status: "requested" }
  | {
      status: "skipped";
      reason:
        | "unsupported_action"
        | "no_slack_channel"
        | "no_destination"
        | "not_pending"
        | "post_failed";
    };

type ScheduledActionSlackResponse = {
  feedback: string;
};

export function canScheduledActionUseSlackApproval(actionType: ActionType) {
  return (
    actionType === ActionType.REPLY ||
    actionType === ActionType.SEND_EMAIL ||
    actionType === ActionType.FORWARD
  );
}

export async function requestSlackApprovalForScheduledAction({
  scheduledAction,
  logger,
}: {
  scheduledAction: ApprovalEligibleScheduledAction;
  logger: Logger;
}): Promise<SlackApprovalRequestResult> {
  if (!canScheduledActionUseSlackApproval(scheduledAction.actionType)) {
    return { status: "skipped", reason: "unsupported_action" };
  }

  const messagingChannel = await prisma.messagingChannel.findFirst({
    where: {
      emailAccountId: scheduledAction.emailAccountId,
      provider: MessagingProvider.SLACK,
      isConnected: true,
      accessToken: { not: null },
      OR: [{ channelId: { not: null } }, { providerUserId: { not: null } }],
    },
    select: {
      accessToken: true,
      channelId: true,
      providerUserId: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!messagingChannel?.accessToken) {
    return { status: "skipped", reason: "no_slack_channel" };
  }

  const reserved = await markScheduledActionAwaitingConfirmation(
    scheduledAction.id,
  );
  if (!reserved) {
    return { status: "skipped", reason: "not_pending" };
  }

  try {
    const destinationChannelId = await resolveSlackDestination({
      accessToken: messagingChannel.accessToken,
      channelId: messagingChannel.channelId,
      providerUserId: messagingChannel.providerUserId,
    });

    if (!destinationChannelId) {
      await revertScheduledActionAwaitingConfirmation(scheduledAction.id);
      return { status: "skipped", reason: "no_destination" };
    }

    const client = createSlackClient(messagingChannel.accessToken);
    await postMessageWithJoin(client, destinationChannelId, {
      ...buildSlackApprovalMessage(scheduledAction),
    });

    logger.info("Scheduled action handed off for Slack approval", {
      scheduledActionId: scheduledAction.id,
      actionType: scheduledAction.actionType,
      destinationChannelId,
    });

    return { status: "requested" };
  } catch (error) {
    await revertScheduledActionAwaitingConfirmation(scheduledAction.id);
    logger.warn("Failed to post scheduled action Slack approval request", {
      scheduledActionId: scheduledAction.id,
      actionType: scheduledAction.actionType,
      error,
    });
    return { status: "skipped", reason: "post_failed" };
  }
}

export async function approveScheduledActionFromSlack({
  scheduledActionId,
  providerUserId,
  teamId,
  logger,
}: {
  scheduledActionId: string;
  providerUserId: string | undefined;
  teamId: string | null;
  logger: Logger;
}): Promise<ScheduledActionSlackResponse> {
  const scheduledAction = await prisma.scheduledAction.findUnique({
    where: { id: scheduledActionId },
    include: {
      emailAccount: {
        include: {
          account: {
            select: {
              provider: true,
            },
          },
        },
      },
      executedRule: true,
    },
  });

  if (!scheduledAction) {
    return { feedback: "That delayed action no longer exists." };
  }

  const authorized = await isAuthorizedSlackApprover({
    emailAccountId: scheduledAction.emailAccountId,
    providerUserId,
    teamId,
  });
  if (!authorized) {
    return {
      feedback: "You don't have permission to approve this delayed action.",
    };
  }

  if (scheduledAction.status === ScheduledActionStatus.COMPLETED) {
    return { feedback: "That delayed action was already approved." };
  }

  if (scheduledAction.status === ScheduledActionStatus.CANCELLED) {
    return { feedback: "That delayed action was already rejected." };
  }

  if (scheduledAction.status !== ScheduledActionStatus.AWAITING_CONFIRMATION) {
    return { feedback: "That delayed action is no longer awaiting approval." };
  }

  if (!scheduledAction.emailAccount.account.provider) {
    return {
      feedback:
        "I couldn't access this email account right now. Please try again.",
    };
  }

  const claimed = await markAwaitingConfirmationActionAsExecuting(
    scheduledAction.id,
  );
  if (!claimed) {
    return { feedback: "That delayed action is already being processed." };
  }

  try {
    const provider = await createEmailProvider({
      emailAccountId: scheduledAction.emailAccountId,
      provider: scheduledAction.emailAccount.account.provider,
      logger,
    });

    const executionResult = await executeScheduledAction(
      scheduledAction,
      provider,
      logger,
    );

    if (!executionResult.success) {
      return {
        feedback: "I couldn't send that delayed action. Please try again.",
      };
    }

    if (executionResult.reason === "Email no longer exists") {
      return {
        feedback: "The original email no longer exists, so nothing was sent.",
      };
    }
  } catch (error) {
    logger.warn("Failed to approve scheduled action from Slack", {
      scheduledActionId,
      error,
    });
    await prisma.scheduledAction.update({
      where: { id: scheduledAction.id },
      data: {
        status: ScheduledActionStatus.FAILED,
      },
    });

    return {
      feedback: "I couldn't send that delayed action. Please try again.",
    };
  }

  return { feedback: "Approved and sent." };
}

export async function rejectScheduledActionFromSlack({
  scheduledActionId,
  providerUserId,
  teamId,
  logger,
}: {
  scheduledActionId: string;
  providerUserId: string | undefined;
  teamId: string | null;
  logger: Logger;
}): Promise<ScheduledActionSlackResponse> {
  const scheduledAction = await prisma.scheduledAction.findUnique({
    where: { id: scheduledActionId },
    select: {
      id: true,
      emailAccountId: true,
      executedRuleId: true,
      status: true,
    },
  });

  if (!scheduledAction) {
    return { feedback: "That delayed action no longer exists." };
  }

  const authorized = await isAuthorizedSlackApprover({
    emailAccountId: scheduledAction.emailAccountId,
    providerUserId,
    teamId,
  });
  if (!authorized) {
    return {
      feedback: "You don't have permission to reject this delayed action.",
    };
  }

  if (scheduledAction.status === ScheduledActionStatus.COMPLETED) {
    return { feedback: "That delayed action was already approved." };
  }

  if (scheduledAction.status === ScheduledActionStatus.CANCELLED) {
    return { feedback: "That delayed action was already rejected." };
  }

  if (scheduledAction.status !== ScheduledActionStatus.AWAITING_CONFIRMATION) {
    return { feedback: "That delayed action is no longer awaiting approval." };
  }

  const cancelled = await cancelAwaitingConfirmationScheduledAction(
    scheduledAction.id,
  );
  if (!cancelled) {
    return { feedback: "That delayed action is already being processed." };
  }

  await finalizeExecutedRuleIfNoPendingActions(
    scheduledAction.executedRuleId,
    logger,
  );

  return { feedback: "Rejected. The delayed action will not be sent." };
}

function buildSlackApprovalMessage(
  scheduledAction: ApprovalEligibleScheduledAction,
) {
  const summary = buildScheduledActionApprovalSummary(scheduledAction);
  const preview = buildScheduledActionApprovalPreview(scheduledAction.content);

  const blocks: (KnownBlock | Block)[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Review delayed email action*\n${escapeSlackMrkdwn(summary)}`,
      },
    },
    ...(preview
      ? [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Draft preview*\n${formatSlackQuote(preview)}`,
            },
          },
        ]
      : []),
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Delay elapsed at ${escapeSlackMrkdwn(
            scheduledAction.scheduledFor.toISOString(),
          )}.`,
        },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: SCHEDULED_ACTION_APPROVE_ACTION_ID,
          text: { type: "plain_text", text: "Approve" },
          style: "primary",
          value: scheduledAction.id,
        },
        {
          type: "button",
          action_id: SCHEDULED_ACTION_REJECT_ACTION_ID,
          text: { type: "plain_text", text: "Reject" },
          style: "danger",
          value: scheduledAction.id,
        },
      ],
    },
  ];

  return {
    text: summary,
    blocks,
  };
}

function buildScheduledActionApprovalSummary(
  scheduledAction: ApprovalEligibleScheduledAction,
) {
  switch (scheduledAction.actionType) {
    case ActionType.SEND_EMAIL: {
      if (scheduledAction.to && scheduledAction.subject) {
        return `Approve the scheduled email to ${scheduledAction.to} about "${scheduledAction.subject}".`;
      }
      if (scheduledAction.to) {
        return `Approve the scheduled email to ${scheduledAction.to}.`;
      }
      return "Approve the scheduled email.";
    }
    case ActionType.REPLY: {
      if (scheduledAction.subject) {
        return `Approve the scheduled reply about "${scheduledAction.subject}".`;
      }
      return "Approve the scheduled reply.";
    }
    case ActionType.FORWARD: {
      if (scheduledAction.to) {
        return `Approve the scheduled forward to ${scheduledAction.to}.`;
      }
      return "Approve the scheduled forward.";
    }
    default: {
      return "Approve the scheduled email action.";
    }
  }
}

function buildScheduledActionApprovalPreview(content: string | null) {
  if (!content) return null;

  const normalized = removeExcessiveWhitespace(content);
  if (!normalized) return null;

  return truncate(normalized, PREVIEW_MAX_CHARS);
}

async function isAuthorizedSlackApprover({
  emailAccountId,
  providerUserId,
  teamId,
}: {
  emailAccountId: string;
  providerUserId: string | undefined;
  teamId: string | null;
}) {
  if (!providerUserId) return false;

  const authorizedChannel = await prisma.messagingChannel.findFirst({
    where: {
      provider: MessagingProvider.SLACK,
      emailAccountId,
      providerUserId,
      isConnected: true,
      ...(teamId ? { teamId } : {}),
    },
    select: { id: true },
  });

  return Boolean(authorizedChannel);
}

function formatSlackQuote(text: string) {
  return text
    .split("\n")
    .map((line) => `> ${escapeSlackMrkdwn(line || " ")}`)
    .join("\n");
}

function escapeSlackMrkdwn(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
