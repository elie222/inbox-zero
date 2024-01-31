import { type gmail_v1 } from "googleapis";
import { sleep } from "@/utils/sleep";
import { getMessagesBatch } from "@/utils/gmail/message";
import { isDefined } from "@/utils/types";
import { extractDomainFromEmail } from "@/utils/email";
import { findUnsubscribeLink, getHeaderUnsubscribe } from "@/utils/unsubscribe";
import { IndexedDBEmail } from "@/app/api/user/stats/emails/all/validation";
import { LoadIDBEmailsBody } from "@/app/api/user/stats/emails/all/validation";

enum Operation {
  LOAD_AFTER_LATEST = "LOAD_AFTER_LATEST",
  LOAD_BEFORE_LAST = "LOAD_BEFORE_LAST",
  LOAD_BEFORE_TIMESTAMP = "LOAD_BEFORE_TIMESTAMP",
  LOAD_AFTER_TIMESTAMP = "LOAD_AFTER_TIMESTAMP",
}

const PAGE_SIZE = 100;
const PAUSE_AFTER_RATE_LIMIT = 1_000;
const MAX_PAGES = 1;
const getLastEmail = async ({
  ownerEmail,
  direction,
  gmail,
}: {
  ownerEmail: string;
  direction: "oldest" | "newest";
  gmail: gmail_v1.Gmail;
}) =>
  await gmail.users.messages.list({
    userId: "me",
    maxResults: PAGE_SIZE,
    q: direction === "oldest" ? `before:2004:04:01` : undefined, // TODO: check this
  });

const getTimestamp = (savedMail: Awaited<ReturnType<typeof getLastEmail>>) => {
  if (savedMail?.data?.messages) {
    return parseInt(
      savedMail?.data?.messages?.length > 0
        ? savedMail?.data?.messages[0]?.internalDate ?? "0"
        : "0",
    );
  }
  return 0;
};
export async function loadIndexedDBMails(
  options: {
    ownerEmail: string;
    gmail: gmail_v1.Gmail;
    accessToken: string;
  },
  body: LoadIDBEmailsBody,
) {
  const mailList: Array<IndexedDBEmail> = [];
  const { ownerEmail, gmail, accessToken } = options;

  let nextPageToken: string | undefined;

  const [oldestEmailSaved, newestEmailSaved] = await Promise.all([
    getLastEmail({ ownerEmail, direction: "oldest", gmail }),
    getLastEmail({ ownerEmail, direction: "newest", gmail }),
  ]);
  console.log("oldestEmailSaved", oldestEmailSaved);
  console.log("newestEmailSaved", newestEmailSaved);

  let after =
    (!body.loadBefore && body.timestamp) || getTimestamp(newestEmailSaved);
  console.log("Loading emails after:", after);

  let before =
    (body.loadBefore && body.timestamp) || getTimestamp(oldestEmailSaved);

  const getMailHandler =
    (operation: Operation) => async (timestamp: number) => {
      let pages = 0;
      const operationRequest = () => ({
        ownerEmail,
        gmail,
        accessToken,
        nextPageToken,
        ...(operation === Operation.LOAD_AFTER_LATEST ||
        operation === Operation.LOAD_AFTER_TIMESTAMP
          ? { after: timestamp, before: undefined }
          : { after: undefined, before: timestamp }),
      });

      while (pages < MAX_PAGES) {
        console.log("After Page", pages);
        let batchResponse, res;
        try {
          batchResponse = await saveBatch(operationRequest());
          mailList.push(...batchResponse.emailsToPublish);
          res = batchResponse.res;
        } catch (error) {
          console.log(
            `Rate limited. Waiting ${PAUSE_AFTER_RATE_LIMIT} seconds...`,
          );
          await sleep(PAUSE_AFTER_RATE_LIMIT);
          batchResponse = await saveBatch(operationRequest());
          mailList.push(...batchResponse.emailsToPublish);
          res = batchResponse.res;
        }

        nextPageToken = res.data.nextPageToken ?? undefined;

        if (!res.data.messages || res.data.messages.length < PAGE_SIZE) break;
        else pages++;
      }
      return pages;
    };

  let pages = await getMailHandler(
    body.loadBefore
      ? Operation.LOAD_AFTER_TIMESTAMP
      : Operation.LOAD_AFTER_LATEST,
  )(body.loadBefore ? before : after);

  return { pages, emails: mailList };
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

  // 2. fetch each email and return them --
  const messages = await getMessagesBatch(
    res.data.messages?.map((m) => m.id!) || [],
    accessToken,
  );

  const emailsToPublish: IndexedDBEmail[] = (
    await Promise.all(
      // why is this function async ?? This could simply be sync (including promise)
      messages.map(async (m) => {
        if (!m.id || !m.threadId) return;

        // console.debug("Fetching message", m.id);

        const parsedEmail = m.parsedMessage;

        const unsubscribeLink =
          findUnsubscribeLink(parsedEmail.textHtml) ||
          getHeaderUnsubscribe(parsedEmail.headers);

        const indexedDBEmail: IndexedDBEmail = {
          ownerEmail,
          threadId: m.threadId,
          gmailMessageId: m.id,
          from: parsedEmail.headers.from,
          fromDomain: extractDomainFromEmail(parsedEmail.headers.from),
          to: parsedEmail.headers.to || "Missing",
          toDomain: parsedEmail.headers.to
            ? extractDomainFromEmail(parsedEmail.headers.to)
            : "Missing",
          subject: parsedEmail.headers.subject,
          timestamp: +new Date(parsedEmail.headers.date),
          unsubscribeLink,
          read: !parsedEmail.labelIds?.includes("UNREAD"),
          sent: !!parsedEmail.labelIds?.includes("SENT"),
          draft: !!parsedEmail.labelIds?.includes("DRAFT"),
          inbox: !!parsedEmail.labelIds?.includes("INBOX"),
          sizeEstimate: m.sizeEstimate,
        };

        if (!indexedDBEmail.timestamp) {
          console.error(
            "No timestamp for email",
            indexedDBEmail.ownerEmail,
            indexedDBEmail.gmailMessageId,
            parsedEmail.headers.date,
          );
          return;
        }
        return indexedDBEmail;
      }) || [],
    )
  ).filter(isDefined);

  console.log("Publishing", emailsToPublish.length, "emails");

  return { res, emailsToPublish };
}
