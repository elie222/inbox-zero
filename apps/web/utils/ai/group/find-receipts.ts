import type { gmail_v1 } from "googleapis";
import uniq from "lodash/uniq";
import uniqBy from "lodash/uniqBy";
import { queryBatchMessagesPages } from "@/utils/gmail/message";
import { GroupItemType } from "@prisma/client";

export async function findReceipts(gmail: gmail_v1.Gmail, accessToken: string) {
  const senders = await findReceiptSenders(gmail, accessToken);
  const subjects = await findReceiptSubjects(gmail, accessToken);
  const filteredSubjects = uniqBy(
    subjects.filter((subject) => !senders.includes(subject.from)),
    (s) => s.subject,
  );

  return [
    ...senders.map((sender) => ({
      type: GroupItemType.FROM,
      value: sender,
    })),
    ...filteredSubjects.map((subject) => ({
      type: GroupItemType.SUBJECT,
      value: subject.subject,
    })),
  ];
}

const receiptSenders = ["invoice", "receipt", "payment"];

async function findReceiptSenders(gmail: gmail_v1.Gmail, accessToken: string) {
  const query = `from:(${receiptSenders.join(" OR ")})`;
  const messages = await queryBatchMessagesPages(gmail, accessToken, {
    query,
    maxResults: 100,
  });

  return uniq(messages.map((message) => message.headers.from));
}

const receiptSubjects = [
  "invoice",
  "receipt",
  "payment",
  '"purchase order"',
  '"order confirmation"',
  '"billing statement"',
];

async function findReceiptSubjects(gmail: gmail_v1.Gmail, accessToken: string) {
  const query = `subject:(${receiptSubjects.join(" OR ")})`;
  const messages = await queryBatchMessagesPages(gmail, accessToken, {
    query,
    maxResults: 100,
  });

  return uniqBy(
    messages.map((message) => ({
      from: message.headers.from,
      subject: removeNumbersFromSubject(message.headers.subject),
    })),
    (message) => message.from,
  );
}

export function removeNumbersFromSubject(subject: string) {
  // replace numbers to make subject more generic
  // also removes [], () ,and words that start with #
  // only a GPT can understand what is written here
  const regex =
    /(\b\d+(\.\d+)?(-\d+(\.\d+)?)?(\b|[A-Za-z])|\[.*?\]|\(.*?\)|\b#\w+)/g;

  // remove any words that contain numbers
  const regexRemoveNumberWords = /\b\w*\d\w*\b/g;

  return subject?.replaceAll(regexRemoveNumberWords, "")?.replaceAll(regex, "");
}
