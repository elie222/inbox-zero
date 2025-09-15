import groupBy from "lodash/groupBy";
import subDays from "date-fns/subDays";
import prisma from "@/utils/prisma";
import { ActionType } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";

const MAX_DRAFTS_TO_CHECK = 10;

const logger = createScopedLogger("auto-draft/disable-unused");

/**
 * Disables auto-draft feature for users who haven't used their last 10 drafts
 * Only checks drafts that are more than a day old to give users time to use them
 */
export async function disableUnusedAutoDrafts() {
  logger.info("Starting to check for unused auto-drafts");

  // Find all users who have the auto-draft feature enabled (have an Action of type DRAFT_EMAIL)
  const autoDraftActions = await findAutoDraftActions();

  logger.info("Found auto-draft actions", { count: autoDraftActions.length });

  const groupedByEmailAccount = groupBy(
    autoDraftActions,
    (action) => action.rule.emailAccountId,
  );

  logger.info("Grouped by email account", {
    count: Object.keys(groupedByEmailAccount).length,
  });

  const results = {
    usersChecked: Object.keys(groupedByEmailAccount).length,
    usersDisabled: 0,
    errors: 0,
  };

  // Process each user
  const entries = Object.entries(groupedByEmailAccount);

  for (const [emailAccountId, actions] of entries) {
    try {
      logger.info("Processing email account", { emailAccountId });

      const ruleIds = actions.map((action) => action.rule.id);

      const executedDraftActions = await findExecutedDraftActions(ruleIds);

      if (executedDraftActions.length < MAX_DRAFTS_TO_CHECK) {
        logger.info("Skipping email account - not enough drafts", {
          emailAccountId,
        });
        continue;
      }

      logger.info("Found executed draft actions", {
        count: executedDraftActions.length,
      });

      const anyDraftsSent = executedDraftActions.some(
        (action) => action.wasDraftSent === true,
      );

      if (anyDraftsSent) {
        logger.info("Skipping email account - drafts were sent", {
          emailAccountId,
        });
      } else {
        logger.info("Disabling auto-draft for email account", {
          emailAccountId,
        });
        const actionIds = actions.map((action) => action.id);
        await deleteAutoDraftActions(actionIds);
        results.usersDisabled++;
      }
    } catch (error) {
      logger.error("Error processing email account", {
        emailAccountId,
        error,
      });
      results.errors++;
    }
  }

  logger.info("Completed auto-draft usage check", results);
  return results;
}

async function findAutoDraftActions() {
  return prisma.action.findMany({
    where: {
      type: ActionType.DRAFT_EMAIL,
      content: null, // if empty then we're auto-drafting
    },
    select: {
      id: true,
      rule: {
        select: {
          id: true,
          emailAccountId: true,
        },
      },
    },
  });
}

async function findExecutedDraftActions(ruleIds: string[]) {
  const oneDayAgo = subDays(new Date(), 1);

  return prisma.executedAction.findMany({
    where: {
      executedRule: { ruleId: { in: ruleIds } },
      draftId: { not: null },
      createdAt: { lt: oneDayAgo }, // Only check drafts older than a day
    },
    select: {
      id: true,
      wasDraftSent: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: MAX_DRAFTS_TO_CHECK,
  });
}

async function deleteAutoDraftActions(actionIds: string[]) {
  return prisma.action.deleteMany({
    where: {
      id: { in: actionIds },
      type: ActionType.DRAFT_EMAIL,
      content: null,
    },
  });
}
