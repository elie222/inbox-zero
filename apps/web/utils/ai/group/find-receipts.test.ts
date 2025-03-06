import { describe, it, expect, vi } from "vitest";
import { isReceiptSubject, isReceiptSender } from "./find-receipts";

vi.mock("server-only", () => ({}));

describe("isReceiptSubject", () => {
  it("should match exact receipt subjects", () => {
    expect(isReceiptSubject("Payment Receipt")).toBe(true);
    expect(isReceiptSubject("Invoice #123")).toBe(true);
    expect(isReceiptSubject("Your receipt from Amazon")).toBe(true);
  });

  it("should match receipt subjects case-insensitively", () => {
    expect(isReceiptSubject("PAYMENT RECEIPT")).toBe(true);
    expect(isReceiptSubject("payment receipt")).toBe(true);
    expect(isReceiptSubject("Invoice is AVAILABLE")).toBe(true);
  });

  it("should match receipt subjects with numbers and special characters", () => {
    expect(isReceiptSubject("Invoice #12345 from Company")).toBe(true);
    expect(isReceiptSubject("Purchase Order #ABC-123")).toBe(true);
    expect(isReceiptSubject("Receipt for subscription payment (ID: 456)")).toBe(
      true,
    );
  });

  it("should not match unrelated subjects", () => {
    expect(isReceiptSubject("Meeting tomorrow")).toBe(false);
    expect(isReceiptSubject("Hello world")).toBe(false);
    expect(isReceiptSubject("Please review this document")).toBe(false);
  });

  it("should not match partial words that look like receipt terms", () => {
    expect(isReceiptSubject("Received your message")).toBe(false);
    expect(isReceiptSubject("Paying you a visit")).toBe(false);
    expect(isReceiptSubject("Invoicing system maintenance")).toBe(false);
  });
});

describe("isReceiptSender", () => {
  it("should match exact receipt senders", () => {
    expect(isReceiptSender("receipt@company.com")).toBe(true);
    expect(isReceiptSender("invoice@business.com")).toBe(true);
    expect(isReceiptSender("invoice+statements@domain.com")).toBe(true);
  });

  it("should match receipt senders as part of email", () => {
    expect(isReceiptSender("no-reply-receipt@company.com")).toBe(true);
    expect(isReceiptSender("automated-invoice@business.com")).toBe(true);
    expect(isReceiptSender("system.invoice+statements@domain.com")).toBe(true);
  });

  it("should not match unrelated email addresses", () => {
    expect(isReceiptSender("contact@company.com")).toBe(false);
    expect(isReceiptSender("support@business.com")).toBe(false);
    expect(isReceiptSender("john.doe@domain.com")).toBe(false);
  });

  it("should not match when receipt terms are in domain only", () => {
    expect(isReceiptSender("hello@receipt.com")).toBe(false);
    expect(isReceiptSender("contact@invoice.net")).toBe(false);
    expect(isReceiptSender("support@invoice-system.org")).toBe(false);
  });
});
