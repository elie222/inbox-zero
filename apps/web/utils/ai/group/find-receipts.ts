import type { gmail_v1 } from "@googleapis/gmail";
import uniq from "lodash/uniq";
import uniqBy from "lodash/uniqBy";
import { queryBatchMessagesPages } from "@/utils/gmail/message";
import { GroupItemType } from "@prisma/client";
import { findMatchingGroupItem } from "@/utils/group/find-matching-group";
import { generalizeSubject } from "@/utils/string";
import type { ParsedMessage } from "@/utils/types";

// Predefined lists of receipt senders and subjects
const defaultReceiptSenders = [
  "invoice+statements",
  "receipt@",
  "invoice@",
  "billing@",
];
const defaultReceiptSubjects = [
  "Invoice #",
  "Payment Receipt",
  "Payment #",
  "Purchase Order #",
  "Purchase Order Number",
  "Your receipt from",
  "Your invoice from",
  "Receipt for subscription payment",
  "Invoice is Available",
  "Invoice Available",
  "order confirmation",
  "billing statement",
  "Invoice - ",
  "Invoice submission",
  "sent you a purchase order",
  "Billing Statement Available",
  "payment was successfully processed",
  "Payment received",
  "Successful payment",
  "Purchase receipt",
];

// Find additional receipts from the user's inbox that don't match the predefined lists
export async function findReceipts(gmail: gmail_v1.Gmail, userEmail: string) {
  const senders = await findReceiptSenders(gmail);
  const subjects = await findReceiptSubjects(gmail);

  // filter out senders that would match the default list
  const filteredSenders = senders.filter(
    (sender) =>
      !findMatchingGroupItem(
        { from: sender, subject: "" },
        defaultReceiptSenders.map((sender) => ({
          type: GroupItemType.FROM,
          value: sender,
          exclude: false,
        })),
      ) && !sender?.includes(userEmail),
  );

  const sendersList = uniq([...filteredSenders, ...defaultReceiptSenders]);

  // filter out subjects that would match the default list
  const filteredSubjects = subjects.filter(
    (email) =>
      !findMatchingGroupItem(
        email,
        defaultReceiptSubjects.map((subject) => ({
          type: GroupItemType.SUBJECT,
          value: subject,
          exclude: false,
        })),
      ) &&
      !findMatchingGroupItem(
        email,
        sendersList.map((sender) => ({
          type: GroupItemType.FROM,
          value: sender,
          exclude: false,
        })),
      ),
  );

  const subjectsList = uniq([
    ...filteredSubjects,
    ...defaultReceiptSubjects.map((subject) => ({ subject })),
  ]);

  return [
    ...sendersList.map((sender) => ({
      type: GroupItemType.FROM,
      value: sender,
    })),
    ...subjectsList.map((subject) => ({
      type: GroupItemType.SUBJECT,
      value: subject.subject,
    })),
  ];
}

const receiptSenders = ["invoice", "receipt", "payment"];

async function findReceiptSenders(gmail: gmail_v1.Gmail) {
  const query = `from:(${receiptSenders.join(" OR ")})`;
  const messages = await queryBatchMessagesPages(gmail, {
    query,
    maxResults: 100,
  });

  return uniq(messages.map((message) => message.headers.from));
}

const receiptSubjects = [
  "invoice",
  "receipt",
  "payment",
  "purchase",
  '"purchase order"',
  '"order confirmation"',
  '"billing statement"',
];

async function findReceiptSubjects(gmail: gmail_v1.Gmail) {
  const query = `subject:(${receiptSubjects.join(" OR ")})`;
  const messages = await queryBatchMessagesPages(gmail, {
    query,
    maxResults: 100,
  });

  return uniqBy(
    messages.map((message) => ({
      from: message.headers.from,
      subject: generalizeSubject(message.headers.subject),
    })),
    (message) => message.from,
  );
}

export function isReceiptSender(sender: string) {
  return defaultReceiptSenders.some((receipt) => sender?.includes(receipt));
}

export function isReceiptSubject(subject: string) {
  const lowerSubject = subject?.toLowerCase();
  return defaultReceiptSubjects.some((receipt) =>
    lowerSubject?.includes(receipt?.toLowerCase()),
  );
}

export function isReceipt(message: ParsedMessage) {
  return (
    isReceiptSender(message.headers.from) ||
    isReceiptSubject(message.headers.subject)
  );
}

export function isMaybeReceipt(message: ParsedMessage) {
  const lowerSubject = message.headers.subject?.toLowerCase();
  return receiptSubjects.some((subject) =>
    lowerSubject?.includes(subject?.toLowerCase()),
  );
}
