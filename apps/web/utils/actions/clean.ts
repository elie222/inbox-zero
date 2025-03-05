"use server";

import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import {
  cleanInboxSchema,
  type CleanInboxBody,
} from "@/utils/actions/clean.validation";
import { getThreadsWithNextPageToken } from "@/utils/gmail/thread";
import { getGmailClient } from "@/utils/gmail/client";
import { bulkPublishToQstash } from "@/utils/upstash";
import { env } from "@/env";
import { GmailLabel } from "@/utils/gmail/label";
import { createScopedLogger } from "@/utils/logger";
import type { CleanThreadBody } from "@/app/api/clean/route";
import { isDefined } from "@/utils/types";

const logger = createScopedLogger("actions/clean");

export const cleanInboxAction = withActionInstrumentation(
  "cleanInbox",
  async (unsafeData: CleanInboxBody) => {
    const session = await auth();
    const userId = session?.user.id;
    if (!userId) return { error: "Not logged in" };

    const { data, success, error } = cleanInboxSchema.safeParse(unsafeData);
    if (!success) return { error: error.message };

    const gmail = getGmailClient(session);

    let nextPageToken: string | undefined | null;

    while (true) {
      // fetch all emails from the user's inbox
      const { threads, nextPageToken: pageToken } =
        await getThreadsWithNextPageToken({
          gmail,
          q: `older_than:${data.daysOld}d`,
          labelIds: [GmailLabel.INBOX],
          maxResults: 100,
        });

      nextPageToken = pageToken;

      if (!pageToken || threads.length === 0) break;

      const url = `${env.WEBHOOK_URL || env.NEXT_PUBLIC_BASE_URL}/api/email`;

      logger.info("Pushing to Qstash", {
        userId,
        threadCount: threads.length,
        nextPageToken,
      });

      await bulkPublishToQstash({
        items: threads
          .map((thread) => {
            if (!thread.id) return;
            return {
              url,
              body: { userId, threadId: thread.id } satisfies CleanThreadBody,
              // give every user their own queue for ai processing. if we get too many parallel users we may need more
              // api keys or a global queue
              // problem with a global queue is that if there's a backlog users will have to wait for others to finish first
              flowControl: {
                key: `ai-clean-${userId}`,
                parallelism: 1,
              },
            };
          })
          .filter(isDefined),
      });
    }
  },
);
