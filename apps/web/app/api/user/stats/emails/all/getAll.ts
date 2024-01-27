import { type gmail_v1 } from "googleapis";
// import { LoadTinybirdEmailsBody } from "@/app/api/user/stats/tinybird/load/validation";
// import { getLastEmail } from "@inboxzero/tinybird";
import { sleep } from "@/utils/sleep";
import { getMessagesBatch } from "@/utils/gmail/message";
import { isDefined } from "@/utils/types";
import { extractDomainFromEmail } from "@/utils/email";
import { findUnsubscribeLink, getHeaderUnsubscribe } from "@/utils/unsubscribe";
import { IndexedDBEmail, TinybirdEmail } from "@inboxzero/tinybird";
import { LoadIDBEmailsBody } from "@/app/api/user/stats/tinybird/load/validation";

// TODO: let body have an extra param where the request object can have an additional param timestamp before or after

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
    // after = savedMail?.data?.messages[0]?.internalDate && +savedMail?.data?.messages[0]?.internalDate;
    return parseInt(
      savedMail?.data?.messages?.length > 0
        ? savedMail?.data?.messages[0]?.internalDate ?? "0"
        : "0",
    ); //.data?.[0]?.timestamp;
  }
  return 0;
};
export async function loadIndexedDBMails(
  options: {
    ownerEmail: string;
    gmail: gmail_v1.Gmail;
    accessToken: string;
  },
  body: LoadIDBEmailsBody, // {loadBefore?:boolean} // this can have an optional param 'timestamp'
) {
  const mailList: Array<IndexedDBEmail> = [];
  const { ownerEmail, gmail, accessToken } = options;

  let nextPageToken: string | undefined; // = undefined;

  const [oldestEmailSaved, newestEmailSaved] = await Promise.all([
    /* getLastEmail this makes get request to tinybird to build pipe*/

    // TODO: is the user's email or senders email ???
    getLastEmail({ ownerEmail, direction: "oldest", gmail }),
    getLastEmail({ ownerEmail, direction: "newest", gmail }),
  ]);
  console.log("lets see what getLastEmail returns");
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

  // TODO :- This logic with the bottom one can be resues and refactored
  //   while (pages < MAX_PAGES) {
  //     console.log("After Page", pages);
  //     let batchResponse, res;
  //     try {
  //       batchResponse = await saveBatch({
  //         ownerEmail,
  //         gmail,
  //         accessToken,
  //         nextPageToken,
  //         // ONLY THESE LINES ARE DIFFERENT
  //         after,
  //         before: undefined,
  //       });
  //       mailList.push(...batchResponse.emailsToPublish);
  //       res = batchResponse.res;
  //     } catch (error) {
  //       console.log(`Rate limited. Waiting ${PAUSE_AFTER_RATE_LIMIT} seconds...`);
  //       await sleep(PAUSE_AFTER_RATE_LIMIT);
  //       batchResponse = await saveBatch({
  //         ownerEmail,
  //         gmail,
  //         accessToken,
  //         nextPageToken,
  //         // ONLY THESE LINES ARE DIFFERENT
  //         after,
  //         before: undefined,
  //       });
  //       mailList.push(...batchResponse.emailsToPublish);
  //       res = batchResponse.res;
  //     }

  //     nextPageToken = res.data.nextPageToken ?? undefined;

  //     if (!res.data.messages || res.data.messages.length < PAGE_SIZE) break;
  //     else pages++;
  //   }

  //   console.log("Completed emails after:", after);

  //   if (!body.loadBefore) return { pages, emails: mailList };

  // TODO: Reuse the following logic
  //   if (newestEmailSaved?.data?.messages) {
  //     // after = newestEmailSaved?.data?.messages[0]?.internalDate && +newestEmailSaved?.data?.messages[0]?.internalDate;
  //     after = parseInt(
  //       newestEmailSaved?.data?.messages?.length > 0
  //         ? newestEmailSaved?.data?.messages[0]?.internalDate ?? "0"
  //         : "0",
  //     ); //.data?.[0]?.timestamp;
  //   }

  //   let before =
  //     (body.loadBefore && body.timestamp) || getTimestamp(oldestEmailSaved);
  //   // const before = oldestEmailSaved.data?.[0]?.timestamp;
  //   console.log("Loading emails before:", before);

  //   while (pages < MAX_PAGES) {
  //     console.log("Before Page", pages);
  //     let batchResponse, res;
  //     try {
  //       batchResponse = await saveBatch({
  //         ownerEmail,
  //         gmail,
  //         accessToken,
  //         nextPageToken,
  //         before,
  //         after: undefined,
  //       });
  //       mailList.push(...batchResponse.emailsToPublish);
  //       res = batchResponse.res;
  //     } catch (error) {
  //       console.log("Rate limited. Waiting 10 seconds...");
  //       await sleep(PAUSE_AFTER_RATE_LIMIT);
  //       batchResponse = await saveBatch({
  //         ownerEmail,
  //         gmail,
  //         accessToken,
  //         nextPageToken,
  //         before,
  //         after: undefined,
  //       });
  //       res = batchResponse.res;
  //     }

  //     nextPageToken = res.data.nextPageToken ?? undefined;

  //     if (!res.data.messages || res.data.messages.length < PAGE_SIZE) break;
  //     else pages++;
  //   }

  //   console.log("Completed emails before:", before);

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

  // 2. fetch each email and publish it to tinybird--
  const messages = await getMessagesBatch(
    res.data.messages?.map((m) => m.id!) || [],
    accessToken,
  );

  const emailsToPublish: IndexedDBEmail[] = (
    await Promise.all(
      // why is this function async ??
      messages.map(async (m) => {
        if (!m.id || !m.threadId) return;

        // console.debug("Fetching message", m.id);

        const parsedEmail = m.parsedMessage;

        const unsubscribeLink =
          findUnsubscribeLink(parsedEmail.textHtml) ||
          getHeaderUnsubscribe(parsedEmail.headers);

        // this needs to go in indexdb ; check if you want to send message or make a pseudo request to the sw
        // make a fn that returns the object
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
        // this returns the ds back to the caller i.e the map function
        return indexedDBEmail;
      }) || [],
    )
  ).filter(isDefined);

  console.log("Publishing", emailsToPublish.length, "emails");

  // this actually puts / publishes mails to tinybird and returns response of type
  /* declare const eventIngestReponseData: z.ZodObject<{
    successful_rows: z.ZodNumber;
    quarantined_rows: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    successful_rows: number;
    quarantined_rows: number;
}, {
    successful_rows: number;
    quarantined_rows: number;
}>; */
  //   await publishEmail(emailsToPublish);

  return { res, emailsToPublish };
}
