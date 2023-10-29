import { NextResponse } from "next/server";
import { gmail_v1 } from "googleapis";
import * as cheerio from "cheerio";
import { z } from "zod";
import { getAuthSession } from "@/utils/auth";
import { withError } from "@/utils/middleware";
import { TinybirdEmail, getLastEmail, publishEmail } from "@inboxzero/tinybird";
import { getGmailClient } from "@/utils/gmail/client";
import { parseMessage } from "@/utils/mail";
import { getMessage } from "@/utils/gmail/message";
import { isDefined } from "@/utils/types";
import { sleep } from "@/utils/sleep";

export const maxDuration = 300;

const PAGE_SIZE = 500;
const PAUSE_AFTER_RATE_LIMIT = 20_000;

export const loadTinybirdEmailsBody = z.object({
  loadBefore: z.coerce.boolean().optional(),
});
export type LoadTinybirdEmailsBody = z.infer<typeof loadTinybirdEmailsBody>;
export type LoadTinybirdEmailsResponse = Awaited<
  ReturnType<typeof publishAllEmails>
>;

async function publishAllEmails(
  options: {
    ownerEmail: string;
    gmail: gmail_v1.Gmail;
  },
  body: LoadTinybirdEmailsBody
) {
  const { ownerEmail, gmail } = options;

  let nextPageToken: string | undefined = undefined;
  let pages = 0;

  const [oldestEmailSaved, newestEmailSaved] = await Promise.all([
    getLastEmail({ ownerEmail, direction: "oldest" }),
    getLastEmail({ ownerEmail, direction: "newest" }),
  ]);

  const after = newestEmailSaved.data?.[0]?.timestamp;
  console.log("Loading emails after:", after);

  while (true) {
    console.log("After Page", pages);
    let res;
    try {
      res = await saveBatch({
        ownerEmail,
        gmail,
        nextPageToken,
        after,
        before: undefined,
      });
    } catch (error) {
      console.log(`Rate limited. Waiting ${PAUSE_AFTER_RATE_LIMIT} seconds...`);
      await sleep(PAUSE_AFTER_RATE_LIMIT);
      res = await saveBatch({
        ownerEmail,
        gmail,
        nextPageToken,
        after,
        before: undefined,
      });
    }

    nextPageToken = res.data.nextPageToken ?? undefined;

    if (!res.data.messages || res.data.messages.length < PAGE_SIZE) break;
    else pages++;
  }

  console.log("Completed emails after:", after);

  if (!body.loadBefore) return { pages };

  const before = oldestEmailSaved.data?.[0]?.timestamp;
  console.log("Loading emails before:", before);

  while (true) {
    console.log("Before Page", pages);
    let res;
    try {
      res = await saveBatch({
        ownerEmail,
        gmail,
        nextPageToken,
        before,
        after: undefined,
      });
    } catch (error) {
      console.log("Rate limited. Waiting 10 seconds...");
      await sleep(PAUSE_AFTER_RATE_LIMIT);
      res = await saveBatch({
        ownerEmail,
        gmail,
        nextPageToken,
        before,
        after: undefined,
      });
    }

    nextPageToken = res.data.nextPageToken ?? undefined;

    if (!res.data.messages || res.data.messages.length < PAGE_SIZE) break;
    else pages++;
  }

  console.log("Completed emails before:", before);

  return { pages };
}

async function saveBatch(
  options: {
    ownerEmail: string;
    gmail: gmail_v1.Gmail;
    nextPageToken?: string;
  } & (
    | { before: number; after: undefined }
    | { before: undefined; after: number }
  )
) {
  const { ownerEmail, gmail, nextPageToken, before, after } = options;

  // 1. find all emails since the last time we ran this function
  const q = before
    ? `before:${before / 1000 + 1}`
    : after
    ? `after:${after / 1000 - 1}`
    : undefined;

  const res = await gmail.users.messages.list({
    userId: "me",
    maxResults: PAGE_SIZE,
    pageToken: nextPageToken,
    q,
  });

  // 2. fetch each email and publish it to tinybird
  const emailsToPublish: TinybirdEmail[] = (
    await Promise.all(
      res.data.messages?.map(async (m) => {
        if (!m.id || !m.threadId) return;

        // console.debug("Fetching message", m.id);

        const message = await getMessage(m.id, gmail);
        const parsedEmail = parseMessage(message);

        const unsubscribeLink = parsedEmail.textHtml
          ? findUnsubscribeLink(parsedEmail.textHtml)
          : undefined;

        const tinybirdEmail: TinybirdEmail = {
          ownerEmail,
          threadId: m.threadId,
          gmailMessageId: m.id,
          from: parsedEmail.headers.from,
          to: parsedEmail.headers.to || "Missing",
          subject: parsedEmail.headers.subject,
          timestamp: +new Date(parsedEmail.headers.date),
          unsubscribeLink,
          read: !parsedEmail.labelIds?.includes("UNREAD"),
          sent: !!parsedEmail.labelIds?.includes("SENT"),
          draft: !!parsedEmail.labelIds?.includes("DRAFT"),
          inbox: !!parsedEmail.labelIds?.includes("INBOX"),
          sizeEstimate: message.sizeEstimate,
        };

        return tinybirdEmail;
      }) || []
    )
  ).filter(isDefined);

  console.log("Publishing", emailsToPublish.length, "emails");

  await publishEmail(emailsToPublish);

  return res;
}

function findUnsubscribeLink(html: string) {
  const $ = cheerio.load(html);
  let unsubscribeLink: string | undefined;

  $("a").each((_index, element) => {
    const text = $(element).text().toLowerCase();
    if (text.includes("unsubscribe")) {
      unsubscribeLink = $(element).attr("href");
      return false; // break the loop
    }
  });

  return unsubscribeLink;
}

export const POST = withError(async (request: Request) => {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = loadTinybirdEmailsBody.parse(json);

  const gmail = getGmailClient(session);

  const result = await publishAllEmails(
    {
      ownerEmail: session.user.email,
      gmail,
    },
    body
  );

  return NextResponse.json(result);
});
