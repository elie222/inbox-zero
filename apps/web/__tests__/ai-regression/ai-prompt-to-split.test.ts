import { describe, expect, it } from "vitest";
import { MailSplitKind } from "@/generated/prisma/enums";
import { aiPromptToSplit } from "@/utils/ai/split/prompt-to-split";
import { getEmailAccount } from "@/__tests__/helpers";

// Run with: pnpm test-ai ai-regression/ai-prompt-to-split

const isAiTest = process.env.RUN_AI_TESTS === "true";

const TIMEOUT = 15_000;

const OPTIONS = [
  { id: "state:unread", name: "Unread", kind: MailSplitKind.UNREAD },
  {
    id: "category:CATEGORY_PERSONAL",
    name: "Personal",
    kind: MailSplitKind.CATEGORY,
  },
  {
    id: "category:CATEGORY_PROMOTIONS",
    name: "Promotions",
    kind: MailSplitKind.CATEGORY,
  },
  { id: "label:lbl-newsletter", name: "Newsletter", kind: MailSplitKind.LABEL },
  { id: "label:lbl-receipts", name: "Receipts", kind: MailSplitKind.LABEL },
  { id: "label:lbl-github", name: "GitHub", kind: MailSplitKind.LABEL },
];

describe.runIf(isAiTest)("aiPromptToSplit", () => {
  it(
    "matches a semantic description to the right label",
    async () => {
      const result = await aiPromptToSplit({
        emailAccount: getEmailAccount(),
        prompt: "invoices and purchase confirmations",
        options: OPTIONS,
      });

      expect(result.optionId).toBe("label:lbl-receipts");
      expect(result.name).toBeTruthy();
    },
    TIMEOUT,
  );

  it(
    "matches a description of a read state",
    async () => {
      const result = await aiPromptToSplit({
        emailAccount: getEmailAccount(),
        prompt: "stuff I haven't read yet",
        options: OPTIONS,
      });

      expect(result.optionId).toBe("state:unread");
    },
    TIMEOUT,
  );

  it(
    "returns no match rather than guessing",
    async () => {
      const result = await aiPromptToSplit({
        emailAccount: getEmailAccount(),
        prompt: "urgent emails from my boss",
        options: OPTIONS,
      });

      expect(result.optionId).toBeNull();
    },
    TIMEOUT,
  );

  // Observed live: a weak model matched this to an unrelated category and named
  // the tab after the description, producing a tab that lies about its filter.
  it(
    "returns no match for a topic no option covers",
    async () => {
      const result = await aiPromptToSplit({
        emailAccount: getEmailAccount(),
        prompt: "flight itineraries and travel bookings",
        options: OPTIONS,
      });

      expect(result.optionId).toBeNull();
    },
    TIMEOUT,
  );
});
