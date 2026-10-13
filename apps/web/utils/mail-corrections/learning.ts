import {
  ActionType,
  ClassificationFeedbackEventType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { learnObservedSpam } from "@/utils/spam/worker-client";
import type { Logger } from "@/utils/logger";
import { saveClassificationFeedback } from "@/utils/rule/classification-feedback";
import { removeAiLearnedPattern } from "@/utils/rule/learned-patterns";
import {
  classifyCorrection,
  matchesAutomaticRoute,
  type PendingCorrection,
} from "./changes";

export type CorrectionTarget = {
  name: string;
  ruleId: string;
  labelId?: string;
  folderId?: string;
};

export async function learnCorrection({
  emailAccountId,
  change,
  targets,
  automaticRoutes,
  logger,
}: {
  emailAccountId: string;
  change: PendingCorrection;
  targets: CorrectionTarget[];
  automaticRoutes: { target: string; recipientDomains: string[] }[];
  logger: Logger;
}): Promise<"learned" | "ignored" | "automatic"> {
  const correction = classifyCorrection(change);
  if (!correction) return "ignored";
  if (matchesAutomaticRoute(change, automaticRoutes)) return "automatic";
  const selected = [...correction.added, ...correction.removed].map((name) =>
    targets.find((t) => t.name === name),
  );
  const ids = [change.before.messageId, change.after.messageId];
  if (change.after.rfcMessageId) {
    const indexed = await prisma.iCloudMessage.findMany({
      where: { emailAccountId, messageIdHeader: change.after.rfcMessageId },
      select: { id: true },
    });
    ids.push(...indexed.map((row) => row.id));
  }
  const recentActions = await prisma.executedAction.findMany({
    where: {
      executedRule: { emailAccountId, messageId: { in: ids } },
      updatedAt: { gte: new Date(change.before.observedAt - 1000) },
      executionStatus: "SUCCEEDED",
      type: {
        in: [
          ActionType.MOVE_FOLDER,
          ActionType.LABEL,
          ActionType.MARK_SPAM,
          ActionType.ARCHIVE,
        ],
      },
    },
    select: { type: true, labelId: true, folderName: true, folderId: true },
  });
  if (
    recentActions.some(
      (action) =>
        (action.type === ActionType.ARCHIVE &&
          change.after.targets.includes("@archive")) ||
        correction.added.some((name) => {
          const target = targets.find((t) => t.name === name);
          return (
            (action.type === ActionType.MARK_SPAM && name === "@junk") ||
            (action.type === ActionType.LABEL &&
              !!target?.labelId &&
              action.labelId === target.labelId) ||
            (action.type === ActionType.MOVE_FOLDER &&
              ((!!target?.folderId && action.folderId === target.folderId) ||
                action.folderName === name))
          );
        }),
    )
  )
    return "automatic";

  const spamOutcome = await learnObservedSpam(emailAccountId, change);
  if (spamOutcome === "automatic") return "automatic";
  if (selected.some((target) => !target) || !change.after.sender)
    return spamOutcome === "learned" ? "learned" : "ignored";

  for (const [names, eventType] of [
    [correction.removed, ClassificationFeedbackEventType.LABEL_REMOVED],
    [correction.added, ClassificationFeedbackEventType.LABEL_ADDED],
  ] as const) {
    for (const name of names) {
      const target = targets.find((t) => t.name === name)!;
      const sender = change.after.sender.toLowerCase();
      await prisma.classificationFeedback.deleteMany({
        where: {
          emailAccountId,
          sender,
          ruleId: target.ruleId,
          messageId: change.after.messageId,
          eventType:
            eventType === "LABEL_ADDED" ? "LABEL_REMOVED" : "LABEL_ADDED",
        },
      });
      await saveClassificationFeedback({
        emailAccountId,
        sender,
        ruleId: target.ruleId,
        messageId: change.after.messageId,
        threadId: change.after.threadId,
        subject: change.after.subject,
        observedAt: new Date(change.since),
        eventType,
        logger,
      });
      if (eventType === "LABEL_REMOVED") {
        const removed = await removeAiLearnedPattern({
          emailAccountId,
          from: sender,
          ruleId: target.ruleId,
        });
        if (removed)
          await prisma.emailAccount.update({
            where: { id: emailAccountId },
            data: { rulesRevision: { increment: 1 } },
          });
      }
    }
  }
  return "learned";
}
