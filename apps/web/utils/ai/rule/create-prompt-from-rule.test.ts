import { describe, it, expect } from "vitest";
import { createPromptFromRule } from "./create-prompt-from-rule";
import type { Action, Rule, Category, Group } from "@/generated/prisma";

describe("generatePromptFromRule", () => {
  it("generates prompt for simple archive rule", () => {
    const rule = {
      from: "newsletter@example.com",
      actions: [{ type: "ARCHIVE" }] as Action[],
    } as Rule & { actions: Action[] };

    expect(createPromptFromRule(rule, "google")).toBe(
      'For emails from "newsletter@example.com", archive',
    );
  });

  it("generates prompt for multiple conditions", () => {
    const rule = {
      from: "support@company.com",
      subject: "urgent",
      body: "priority",
      actions: [
        { type: "LABEL", label: "Important" } as Action,
        { type: "FORWARD", to: "manager@company.com" } as Action,
      ],
    } as Rule & { actions: Action[] };

    expect(createPromptFromRule(rule, "google")).toBe(
      'For emails from "support@company.com" and with subject containing "urgent" and with body containing "priority", label as "Important" and forward to manager@company.com',
    );
  });

  it("handles category filters with INCLUDE type", () => {
    const rule = {
      categoryFilterType: "INCLUDE",
      categoryFilters: [
        { name: "Finance" },
        { name: "Important" },
      ] as Category[],
      actions: [{ type: "LABEL", label: "Priority" }] as Action[],
    } as Rule & { actions: Action[]; categoryFilters: Category[] };

    expect(createPromptFromRule(rule, "google")).toBe(
      'For emails from senders in categories: Finance, Important, label as "Priority"',
    );
  });

  it("handles category filters with EXCLUDE type", () => {
    const rule = {
      categoryFilterType: "EXCLUDE",
      categoryFilters: [{ name: "Spam" }] as Category[],
      actions: [{ type: "ARCHIVE" }] as Action[],
    } as Rule & { actions: Action[]; categoryFilters: Category[] };

    expect(createPromptFromRule(rule, "google")).toBe(
      "For emails from senders not in categories: Spam, archive",
    );
  });

  it("handles AI instructions", () => {
    const rule = {
      instructions: "contains a meeting request",
      actions: [
        { type: "DRAFT_EMAIL" },
        { type: "LABEL", label: "Meeting" },
      ] as Action[],
    } as Rule & { actions: Action[] };

    expect(createPromptFromRule(rule, "google")).toBe(
      'For emails matching AI criteria: "contains a meeting request", create a draft and label as "Meeting"',
    );
  });

  it("handles all action types", () => {
    const rule = {
      from: "test@example.com",
      actions: [
        { type: "ARCHIVE" } as Action,
        { type: "LABEL", label: "Test" } as Action,
        { type: "REPLY" } as Action,
        { type: "SEND_EMAIL", to: "other@example.com" } as Action,
        { type: "FORWARD", to: "forward@example.com" } as Action,
        { type: "DRAFT_EMAIL" } as Action,
        { type: "MARK_SPAM" } as Action,
        { type: "CALL_WEBHOOK", url: "https://example.com/webhook" } as Action,
      ],
    } as Rule & { actions: Action[] };

    expect(createPromptFromRule(rule, "google")).toBe(
      'For emails from "test@example.com", archive and label as "Test" and send a reply and send email to other@example.com and forward to forward@example.com and create a draft and mark as spam and call webhook at https://example.com/webhook',
    );
  });

  it("handles rule with no conditions", () => {
    const rule = {
      actions: [{ type: "ARCHIVE" }] as Action[],
    } as Rule & { actions: Action[] };

    expect(createPromptFromRule(rule, "google")).toBe(
      "For all emails, archive",
    );
  });

  it("handles templated reply", () => {
    const rule = {
      from: "job@company.com",
      actions: [
        {
          type: "REPLY",
          content: `Hi {{name}},
{{personalized reply}}

I'd love to set up a time to chat.
Alice`,
        },
      ] as Action[],
    } as Rule & { actions: Action[] };

    expect(createPromptFromRule(rule, "google")).toBe(
      'For emails from "job@company.com", send a templated reply: "Hi {{name}},\n{{personalized reply}}\n\nI\'d love to set up a time to chat.\nAlice"',
    );
  });

  it("handles static reply", () => {
    const rule = {
      subject: "newsletter",
      actions: [
        {
          type: "REPLY",
          content: "Please unsubscribe me from your mailing list.",
        },
      ] as Action[],
    } as Rule & { actions: Action[] };

    expect(createPromptFromRule(rule, "google")).toBe(
      'For emails with subject containing "newsletter", send a static reply: "Please unsubscribe me from your mailing list."',
    );
  });

  it("handles basic reply without content", () => {
    const rule = {
      instructions: "is a meeting request",
      actions: [{ type: "REPLY" }] as Action[],
    } as Rule & { actions: Action[] };

    expect(createPromptFromRule(rule, "google")).toBe(
      'For emails matching AI criteria: "is a meeting request", send a reply',
    );
  });

  it("handles OR conditional operator", () => {
    const rule = {
      from: "sales@company.com",
      subject: "invoice",
      conditionalOperator: "OR",
      actions: [{ type: "LABEL", label: "Sales" }] as Action[],
    } as Rule & { actions: Action[] };

    expect(createPromptFromRule(rule, "google")).toBe(
      'For emails from "sales@company.com" or with subject containing "invoice", label as "Sales"',
    );
  });

  it("uses AND operator by default", () => {
    const rule = {
      from: "sales@company.com",
      subject: "invoice",
      actions: [{ type: "LABEL", label: "Sales" }] as Action[],
    } as Rule & { actions: Action[] };

    expect(createPromptFromRule(rule, "google")).toBe(
      'For emails from "sales@company.com" and with subject containing "invoice", label as "Sales"',
    );
  });

  it("handles group condition", () => {
    const rule = {
      group: { name: "Receipts" } as Group,
      actions: [
        { type: "LABEL", label: "Receipt" },
        { type: "ARCHIVE" },
      ] as Action[],
    } as Rule & { actions: Action[]; group: Group };

    expect(createPromptFromRule(rule, "google")).toBe(
      'For all emails, label as "Receipt" and archive',
    );
  });

  it("combines group with other conditions using AND", () => {
    const rule = {
      group: { name: "Receipts" } as Group,
      subject: "order",
      actions: [{ type: "ARCHIVE" }] as Action[],
    } as Rule & { actions: Action[]; group: Group };

    expect(createPromptFromRule(rule, "google")).toBe(
      'For emails with subject containing "order", archive',
    );
  });

  it("combines group with other conditions using OR", () => {
    const rule = {
      group: { name: "Receipts" } as Group,
      subject: "order",
      conditionalOperator: "OR",
      actions: [{ type: "ARCHIVE" }] as Action[],
    } as Rule & { actions: Action[]; group: Group };

    expect(createPromptFromRule(rule, "google")).toBe(
      'For emails with subject containing "order", archive',
    );
  });
});
