import { z } from "zod";
import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { publishToQstash } from "@/utils/upstash";
import { env } from "@/env";
import { getThreadMessages } from "@/utils/gmail/thread";
import { getGmailClient } from "@/utils/gmail/client";
import type { CleanGmailBody } from "@/app/api/clean/gmail/route";

const cleanThreadBody = z.object({ userId: z.string(), threadId: z.string() });
export type CleanThreadBody = z.infer<typeof cleanThreadBody>;
export type CleanThreadResponse = Awaited<ReturnType<typeof cleanThread>>;

async function cleanThread(body: CleanThreadBody) {
  // 1. get thread with messages
  // 2. process thread with ai / fixed logic
  // 3. add to gmail action queue

  const gmail = getGmailClient({} as any); // TODO:

  const messages = await getThreadMessages(body.threadId, gmail);

  if (!messages.length) return;
  // don't archive convos - TODO: handle with ai
  if (messages.length > 1) return;

  // fixed logic
  // check if has unsub link
  // check if newsletter
  // check if receipt
  // check if promotion/social/update
  // handle with ai

  // max rate:
  // https://developers.google.com/gmail/api/reference/quota
  // 15,000 quota units per user per minute
  // modify thread = 10 units
  // => 1,500 modify threads per minute
  // => 25 modify threads per second
  // => assume user has other actions too => max 12 per second
  const actionCount = 2; // 1. remove "inbox" label. 2. label "clean". increase if we're doing multiple labellings
  const maxRatePerSecond = Math.ceil(12 / actionCount);

  const cleanGmailBody: CleanGmailBody = {
    userId: body.userId,
    threadId: body.threadId,
    archive: true,
    // labelId: "",
  };

  await publishToQstash(
    `${env.WEBHOOK_URL || env.NEXT_PUBLIC_BASE_URL}/api/clean/gmail`,
    cleanGmailBody,
    {
      key: `gmail-action-${body.userId}`,
      ratePerSecond: maxRatePerSecond,
    },
  );
}

// TODO: security
export const POST = withError(async (request: Request) => {
  const json = await request.json();
  const body = cleanThreadBody.parse(json);

  const result = await cleanThread(body);

  return NextResponse.json(result);
});
