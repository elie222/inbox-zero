import { describe, expect, it } from "vitest";
import { MailSplitFilterKind } from "@/generated/prisma/enums";
import { aiPromptToSplitFilters } from "@/utils/ai/split/prompt-to-split";
import { getEmailAccount } from "@/__tests__/helpers";

// Run with: pnpm test-ai ai-regression/ai-prompt-to-split

const isAiTest = process.env.RUN_AI_TESTS === "true";

const TIMEOUT = 60_000;

const OPTIONS = [
  {
    id: "category:CATEGORY_PERSONAL",
    name: "Personal",
    kind: "CATEGORY" as const,
    value: "CATEGORY_PERSONAL",
  },
  {
    id: "category:CATEGORY_PROMOTIONS",
    name: "Promotions",
    kind: "CATEGORY" as const,
    value: "CATEGORY_PROMOTIONS",
  },
  {
    id: "label:lbl-newsletter",
    name: "Newsletter",
    kind: "LABEL" as const,
    value: "lbl-newsletter",
  },
  {
    id: "label:lbl-receipts",
    name: "Receipts",
    kind: "LABEL" as const,
    value: "lbl-receipts",
  },
  {
    id: "label:lbl-github",
    name: "GitHub",
    kind: "LABEL" as const,
    value: "lbl-github",
  },
];

const SENDERS = ["priya@northwind.co", "receipts@stripe.com"];

function build(prompt: string) {
  return aiPromptToSplitFilters({
    emailAccount: getEmailAccount(),
    prompt,
    options: OPTIONS,
    senders: SENDERS,
  });
}

const kinds = (filters: { kind: MailSplitFilterKind }[]) =>
  filters.map((filter) => filter.kind);

describe.runIf(isAiTest)("aiPromptToSplitFilters", () => {
  it(
    "matches a semantic description to the right label",
    async () => {
      const result = await build("invoices and purchase confirmations");

      expect(result.filters).toContainEqual({
        kind: MailSplitFilterKind.LABEL,
        value: "lbl-receipts",
      });
    },
    TIMEOUT,
  );

  it(
    "reads a read state as its own condition",
    async () => {
      const result = await build("stuff I haven't read yet");

      expect(kinds(result.filters)).toContain(MailSplitFilterKind.UNREAD);
    },
    TIMEOUT,
  );

  it(
    "combines conditions when the description names more than one",
    async () => {
      const result = await build("receipts I have not opened yet");

      expect(kinds(result.filters)).toContain(MailSplitFilterKind.UNREAD);
      expect(result.filters).toContainEqual({
        kind: MailSplitFilterKind.LABEL,
        value: "lbl-receipts",
      });
      expect(result.matchAll).toBe(true);
    },
    TIMEOUT,
  );

  it(
    "turns a named sender into a From condition",
    async () => {
      const result = await build("everything from Priya");

      const from = result.filters.find(
        (filter) => filter.kind === MailSplitFilterKind.FROM,
      );
      expect(from?.value).toContain("priya");
    },
    TIMEOUT,
  );

  it(
    "returns nothing rather than guessing at a topic no condition covers",
    async () => {
      const result = await build("flight itineraries and travel bookings");

      expect(result.filters).toEqual([]);
    },
    TIMEOUT,
  );

  it(
    "never invents a label that isn't among the options",
    async () => {
      const result = await build("urgent emails from my boss");

      const labels = result.filters.filter(
        (filter) => filter.kind === MailSplitFilterKind.LABEL,
      );
      for (const label of labels) {
        expect(OPTIONS.map((option) => option.value)).toContain(label.value);
      }
    },
    TIMEOUT,
  );
});
