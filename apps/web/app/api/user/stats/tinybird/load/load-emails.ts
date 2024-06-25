import type { gmail_v1 } from "googleapis";
import type { LoadTinybirdEmailsBody } from "@/app/api/user/stats/tinybird/load/validation";
import { getLastEmail } from "@inboxzero/tinybird";
import { sleep } from "@/utils/sleep";
import { getMessagesBatch } from "@/utils/gmail/message";
import { isDefined } from "@/utils/types";
import { extractDomainFromEmail } from "@/utils/email";
import { type TinybirdEmail, publishEmail } from "@inboxzero/tinybird";
import { findUnsubscribeLink } from "@/utils/parse/parseHtml.server";
import { env } from "@/env.mjs";
import {
  DRAFT_LABEL_ID,
  INBOX_LABEL_ID,
  SENT_LABEL_ID,
  UNREAD_LABEL_ID,
} from "@/utils/gmail/label";

const PAGE_SIZE = 20; // avoid setting too high because it will hit the rate limit
const PAUSE_AFTER_RATE_LIMIT = 10_000;
const MAX_PAGES = 50;

export async function loadTinybirdEmails(
  options: {
    ownerEmail: string;
    gmail: gmail_v1.Gmail;
    accessToken: string;
  },
  body: LoadTinybirdEmailsBody,
) {
  if (!env.TINYBIRD_TOKEN) return { pages: 0 };

  const { ownerEmail, gmail, accessToken } = options;

  let nextPageToken: string | undefined = undefined;
  let pages = 0;

  const [oldestEmailSaved, newestEmailSaved] = await Promise.all([
    getLastEmail({ ownerEmail, direction: "oldest" }),
    getLastEmail({ ownerEmail, direction: "newest" }),
  ]);

  const after = newestEmailSaved.data?.[0]?.timestamp;
  console.log("Loading emails after:", after);

  while (pages < MAX_PAGES) {
    console.log("After Page", pages);
    let res;
    try {
      res = await saveBatch({
        ownerEmail,
        gmail,
        accessToken,
        nextPageToken,
        after,
        before: undefined,
      });
    } catch (error) {
      // TODO save batch won't throw a rate limit error anymore. Just logs: `Error fetching message 429 Resource has been exhausted (e.g. check quota).`
      console.log(`Rate limited. Waiting ${PAUSE_AFTER_RATE_LIMIT} seconds...`);
      await sleep(PAUSE_AFTER_RATE_LIMIT);
      res = await saveBatch({
        ownerEmail,
        gmail,
        accessToken,
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

  while (pages < MAX_PAGES) {
    console.log("Before Page", pages);
    let res;
    try {
      res = await saveBatch({
        ownerEmail,
        gmail,
        accessToken,
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
        accessToken,
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
    accessToken: string;
    nextPageToken?: string;
  } & (
    | { before: number; after: undefined }
    | { before: undefined; after: number }
  ),
) {
  const { ownerEmail, gmail, accessToken, nextPageToken, before, after } =
    options;

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
  const messages = await getMessagesBatch(
    res.data.messages?.map((m) => m.id!) || [],
    accessToken,
  );

  const emailsToPublish: TinybirdEmail[] = messages
    .map((m) => {
      if (!m.id || !m.threadId) return;

      const unsubscribeLink =
        findUnsubscribeLink(m.textHtml) || m.headers["list-unsubscribe"];

      const tinybirdEmail: TinybirdEmail = {
        ownerEmail,
        threadId: m.threadId,
        gmailMessageId: m.id,
        from: m.headers.from,
        fromDomain: extractDomainFromEmail(m.headers.from),
        to: m.headers.to || "Missing",
        toDomain: m.headers.to
          ? extractDomainFromEmail(m.headers.to)
          : "Missing",
        subject: m.headers.subject,
        timestamp: +new Date(m.headers.date),
        unsubscribeLink,
        read: !m.labelIds?.includes(UNREAD_LABEL_ID),
        sent: !!m.labelIds?.includes(SENT_LABEL_ID),
        draft: !!m.labelIds?.includes(DRAFT_LABEL_ID),
        inbox: !!m.labelIds?.includes(INBOX_LABEL_ID),
        sizeEstimate: m.sizeEstimate ?? 0,
      };

      if (!tinybirdEmail.timestamp) {
        console.error(
          "No timestamp for email",
          tinybirdEmail.ownerEmail,
          tinybirdEmail.gmailMessageId,
          m.headers.date,
        );
        return;
      }

      return tinybirdEmail;
    })
    .filter(isDefined);

  console.log("Publishing", emailsToPublish.length, "emails");

  await publishEmail(emailsToPublish);

  return res;
}
