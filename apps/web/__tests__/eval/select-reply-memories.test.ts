import { afterAll, describe, expect, test } from "vitest";
import {
  ReplyMemoryKind,
  ReplyMemoryScopeType,
} from "@/generated/prisma/enums";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { createScopedLogger } from "@/utils/logger";
import { aiSelectRelevantReplyMemories } from "@/utils/ai/reply/select-reply-memories";

// pnpm test-ai eval/select-reply-memories
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/select-reply-memories

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 60_000;
const evalReporter = createEvalReporter({ evalName: "select-reply-memories" });
const logger = createScopedLogger("eval-select-reply-memories");

const candidates = [
  {
    id: "memory-pricing",
    content:
      "The higher pricing tier is $49/month per seat and allows connecting 2 email accounts.",
    kind: ReplyMemoryKind.FACT,
    scopeType: ReplyMemoryScopeType.TOPIC,
    scopeValue: "pricing",
  },
  {
    id: "memory-sender-billing",
    content:
      "This sender is billed annually; mention annual invoicing when discussing costs.",
    kind: ReplyMemoryKind.FACT,
    scopeType: ReplyMemoryScopeType.SENDER,
    scopeValue: "maria@customer.com",
  },
  {
    id: "memory-shipping",
    content:
      "When a shipment is delayed at customs, ask the client for the tracking number and CC the logistics team.",
    kind: ReplyMemoryKind.PROCEDURE,
    scopeType: ReplyMemoryScopeType.TOPIC,
    scopeValue: "shipping",
  },
  {
    id: "memory-hiring",
    content:
      "When a recruiter shares a candidate, forward the profile to the hiring manager for that role.",
    kind: ReplyMemoryKind.PROCEDURE,
    scopeType: ReplyMemoryScopeType.TOPIC,
    scopeValue: "recruiting",
  },
  {
    id: "memory-tours",
    content:
      "When you cannot host a requested tour yourself, decline and offer to ask a nearby colleague.",
    kind: ReplyMemoryKind.PROCEDURE,
    scopeType: ReplyMemoryScopeType.GLOBAL,
    scopeValue: "",
  },
  {
    id: "memory-invoices",
    content:
      "When approving payments from a list, note any vendor that has not responded to prior outreach.",
    kind: ReplyMemoryKind.PROCEDURE,
    scopeType: ReplyMemoryScopeType.GLOBAL,
    scopeValue: "",
  },
  {
    id: "memory-drive",
    content:
      "When asked to share documents for due diligence, share a Google Drive folder link instead of attachments.",
    kind: ReplyMemoryKind.PROCEDURE,
    scopeType: ReplyMemoryScopeType.TOPIC,
    scopeValue: "due diligence",
  },
];

describe.runIf(shouldRunEval)("reply memory selection eval", () => {
  describeEvalMatrix("reply memory selection", (model, emailAccount) => {
    test(
      "picks the memories that answer the email and drops unrelated procedures",
      async () => {
        const result = await aiSelectRelevantReplyMemories({
          candidates,
          emailContent:
            "From: maria@customer.com\nSubject: Plan question\n\nHi! Quick question: how much does the higher tier cost, and can I use it with both of my email accounts?",
          emailAccount,
          logger,
        });

        const selected = result ?? [];
        const pass =
          selected.includes("memory-pricing") &&
          !selected.includes("memory-shipping") &&
          !selected.includes("memory-hiring") &&
          !selected.includes("memory-tours");

        evalReporter.record({
          testName: "pricing question selects pricing facts",
          model: model.label,
          pass,
          expected: "memory-pricing (+ optionally memory-sender-billing)",
          actual: selected.join(", ") || "none",
        });

        expect(selected).toContain("memory-pricing");
        expect(selected).not.toContain("memory-shipping");
        expect(selected).not.toContain("memory-hiring");
        expect(selected).not.toContain("memory-tours");
      },
      TIMEOUT,
    );

    test(
      "selects nothing when no memory applies to the email",
      async () => {
        const result = await aiSelectRelevantReplyMemories({
          candidates,
          emailContent:
            "From: james@partner.com\nSubject: Re: Tuesday sync\n\nSounds good, see you at the sync on Tuesday. No need to prepare anything.",
          emailAccount,
          logger,
        });

        const selected = result ?? [];
        const pass = selected.length === 0;

        evalReporter.record({
          testName: "no relevant memory returns empty",
          model: model.label,
          pass,
          expected: "none",
          actual: selected.join(", ") || "none",
        });

        expect(selected).toEqual([]);
      },
      TIMEOUT,
    );
  });

  afterAll(() => {
    evalReporter.printReport();
  });
});
