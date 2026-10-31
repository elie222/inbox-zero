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

const receiptSubjects = [
  "invoice",
  "receipt",
  "payment",
  "purchase",
  '"purchase order"',
  '"order confirmation"',
  '"billing statement"',
];

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
