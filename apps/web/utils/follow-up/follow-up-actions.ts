import type { ActionEvent } from "chat";
import { MessagingProvider } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

export const FOLLOW_UP_MARK_DONE_ACTION_ID = "follow_up_mark_done";

export const FOLLOW_UP_REMINDER_ACTION_IDS = [
  FOLLOW_UP_MARK_DONE_ACTION_ID,
] as const;

export async function handleFollowUpReminderAction({
  event,
  logger,
}: {
  event: ActionEvent;
  logger: Logger;
}): Promise<void> {
  if (event.actionId !== FOLLOW_UP_MARK_DONE_ACTION_ID) return;

  const trackerId = event.value?.trim();
  if (!trackerId) return;

  const tracker = await prisma.threadTracker.findUnique({
    where: { id: trackerId },
    select: { id: true, resolved: true, emailAccountId: true },
  });

  if (!tracker) {
    await postFeedback(event, logger, "That follow-up is no longer active.");
    return;
  }

  const teamId = getSlackTeamId(event.raw);
  const channel = teamId
    ? await prisma.messagingChannel.findFirst({
        where: {
          emailAccountId: tracker.emailAccountId,
          provider: MessagingProvider.SLACK,
          teamId,
          providerUserId: event.user.userId,
          isConnected: true,
        },
        select: { id: true },
      })
    : null;

  if (!channel) {
    await postFeedback(
      event,
      logger,
      "You don't have permission to act on this follow-up.",
    );
    return;
  }

  if (tracker.resolved) {
    await postFeedback(event, logger, "This follow-up is already done.");
    return;
  }

  await prisma.threadTracker.update({
    where: { id: trackerId },
    data: { resolved: true },
  });

  await postFeedback(
    event,
    logger,
    "Marked done. We won't follow up on this thread again.",
  );
}

async function postFeedback(
  event: ActionEvent,
  logger: Logger,
  text: string,
): Promise<void> {
  const thread = event.thread;
  if (!thread) return;

  if (event.adapter.name === "slack") {
    try {
      await thread.postEphemeral(event.user, text, { fallbackToDM: false });
      return;
    } catch (error) {
      logger.warn("Failed to post follow-up feedback (slack ephemeral)", {
        actionId: event.actionId,
        error,
      });
    }
  }

  try {
    await thread.post(text);
  } catch (error) {
    logger.warn("Failed to post follow-up feedback", {
      actionId: event.actionId,
      error,
    });
  }
}

function getSlackTeamId(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  return (raw as { team?: { id?: string } }).team?.id || null;
}
