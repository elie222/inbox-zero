import { NextResponse } from "next/server";
import subDays from "date-fns/subDays";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { ActionType, SystemType } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";
import { hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";

const logger = createScopedLogger("auto-draft/disable-unused");

// Force dynamic to ensure fresh data on each request
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_DRAFTS_TO_CHECK = 10;

/**
 * Disables auto-draft feature for users who haven't used their last 10 drafts
 * Only checks drafts that are more than a day old to give users time to use them
 */
async function disableUnusedAutoDrafts() {
  logger.info("Starting to check for unused auto-drafts");

  const oneDayAgo = subDays(new Date(), 1);

  // TODO: may need to make this more efficient
  // Find all users who have the auto-draft feature enabled (have an Action of type DRAFT_EMAIL)
  const usersWithAutoDraft = await prisma.user.findMany({
    where: {
      rules: {
        some: {
          systemType: SystemType.TO_REPLY,
          actions: {
            some: {
              type: ActionType.DRAFT_EMAIL,
            },
          },
        },
      },
    },
    select: {
      id: true,
      rules: {
        where: {
          systemType: SystemType.TO_REPLY,
        },
        select: {
          id: true,
        },
      },
    },
  });

  logger.info(
    `Found ${usersWithAutoDraft.length} users with auto-draft enabled`,
  );

  const results = {
    usersChecked: usersWithAutoDraft.length,
    usersDisabled: 0,
    errors: 0,
  };

  // Process each user
  for (const user of usersWithAutoDraft) {
    try {
      // Find the last 10 drafts created for the user
      const lastTenDrafts = await prisma.executedAction.findMany({
        where: {
          executedRule: {
            userId: user.id,
            rule: {
              systemType: SystemType.TO_REPLY,
            },
          },
          type: ActionType.DRAFT_EMAIL,
          draftId: { not: null },
          createdAt: { lt: oneDayAgo }, // Only check drafts older than a day
        },
        orderBy: {
          createdAt: "desc",
        },
        take: MAX_DRAFTS_TO_CHECK,
        select: {
          id: true,
          wasDraftSent: true,
          draftSendLog: {
            select: {
              id: true,
            },
          },
        },
      });

      // Skip if user has fewer than 10 drafts (not enough data to make a decision)
      if (lastTenDrafts.length < MAX_DRAFTS_TO_CHECK) {
        logger.info("Skipping user - only has few drafts", {
          userId: user.id,
          numDrafts: lastTenDrafts.length,
        });
        continue;
      }

      // Check if any of the drafts were sent
      const anyDraftsSent = lastTenDrafts.some(
        (draft) => draft.wasDraftSent === true || draft.draftSendLog,
      );

      // If none of the drafts were sent, disable auto-draft
      if (!anyDraftsSent) {
        logger.info("Disabling auto-draft for user - last 10 drafts not used", {
          userId: user.id,
        });

        // Delete the DRAFT_EMAIL actions from all TO_REPLY rules
        await prisma.action.deleteMany({
          where: {
            rule: {
              userId: user.id,
              systemType: SystemType.TO_REPLY,
            },
            type: ActionType.DRAFT_EMAIL,
            content: null,
          },
        });

        results.usersDisabled++;
      }
    } catch (error) {
      logger.error("Error processing user", { userId: user.id, error });
      captureException(error);
      results.errors++;
    }
  }

  logger.info("Completed auto-draft usage check", results);
  return results;
}

// For easier local testing
// export const GET = withError(async (request) => {
//   if (!hasCronSecret(request)) {
//     captureException(
//       new Error("Unauthorized request: api/auto-draft/disable-unused"),
//     );
//     return new Response("Unauthorized", { status: 401 });
//   }

//   const results = await disableUnusedAutoDrafts();
//   return NextResponse.json(results);
// });

export const POST = withError(async (request: Request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(
      new Error("Unauthorized cron request: api/auto-draft/disable-unused"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  const results = await disableUnusedAutoDrafts();
  return NextResponse.json(results);
});
