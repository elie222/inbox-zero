import { afterAll, describe, expect, test, vi } from "vitest";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import {
  ReplyMemoryKind,
  ReplyMemoryScopeType,
} from "@/generated/prisma/enums";
import { aiExtractReplyMemoriesFromDraftEdit } from "@/utils/ai/reply/reply-memory";

// pnpm test-ai eval/reply-memory
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/reply-memory

vi.mock("server-only", () => ({}));

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 120_000;
const evalReporter = createEvalReporter();

describe.runIf(shouldRunEval)("reply memory extraction eval", () => {
  describeEvalMatrix("reply memory extraction", (model, emailAccount) => {
    test(
      "extracts a reusable factual pricing memory",
      async () => {
        const result = await aiExtractReplyMemoriesFromDraftEdit({
          emailAccount,
          incomingEmailContent:
            "Can you share your pricing for a 30 person team and let me know whether annual billing changes the quote?",
          draftText:
            "Thanks for reaching out. Pricing is available on our website.",
          sentText:
            "Thanks for reaching out. Our starter plan is $24 per seat per month. Enterprise pricing depends on seat count and whether they want annual billing.",
          senderEmail: "buyer@example.com",
          existingMemories: [],
        });

        const pass =
          result.length > 0 &&
          result.length <= 3 &&
          result.some(
            (memory) =>
              memory.kind === ReplyMemoryKind.FACT &&
              /pricing|seat|annual billing/i.test(
                `${memory.title} ${memory.content} ${memory.tags.join(" ")}`,
              ) &&
              (memory.scopeType === ReplyMemoryScopeType.TOPIC ||
                memory.scopeType === ReplyMemoryScopeType.GLOBAL),
          );

        evalReporter.record({
          testName: "pricing fact extraction",
          model: model.label,
          pass,
          expected: "FACT memory about seat-count-based pricing",
          actual: summarizeMemories(result),
        });

        expect(pass).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "does not learn from a one-off scheduling edit",
      async () => {
        const result = await aiExtractReplyMemoriesFromDraftEdit({
          emailAccount,
          incomingEmailContent:
            "Would Tuesday or Wednesday afternoon work for a quick call next week?",
          draftText: "Happy to chat. I am free any time next week.",
          sentText: "Happy to chat. Thursday at 2pm works best for me.",
          senderEmail: "partner@example.com",
          existingMemories: [],
        });

        const pass = result.length === 0;

        evalReporter.record({
          testName: "one-off scheduling edit ignored",
          model: model.label,
          pass,
          expected: "no memory",
          actual: summarizeMemories(result),
        });

        expect(pass).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "extracts a concise style memory from repeated tone edits",
      async () => {
        const result = await aiExtractReplyMemoriesFromDraftEdit({
          emailAccount,
          incomingEmailContent:
            "Thanks for the quick follow-up. Just confirming you got my note.",
          draftText:
            "Hi there! Thanks so much for checking in! I just wanted to let you know that I received your message and I will review it soon!",
          sentText: "Got it. I will review and get back to you.",
          senderEmail: "colleague@example.com",
          existingMemories: [],
        });

        const pass = result.some(
          (memory) =>
            (memory.kind === ReplyMemoryKind.STYLE ||
              memory.kind === ReplyMemoryKind.PREFERENCE) &&
            /short|concise|brief|exclamation|direct/i.test(
              `${memory.title} ${memory.content} ${memory.tags.join(" ")}`,
            ),
        );

        evalReporter.record({
          testName: "concise style extraction",
          model: model.label,
          pass,
          expected: "STYLE/PREFERENCE memory about concise replies",
          actual: summarizeMemories(result),
        });

        expect(pass).toBe(true);
      },
      TIMEOUT,
    );
  });

  afterAll(() => {
    evalReporter.printReport();
  });
});

function summarizeMemories(
  memories: Array<{
    title: string;
    kind: ReplyMemoryKind;
    scopeType: ReplyMemoryScopeType;
    scopeValue: string;
    content: string;
  }>,
) {
  if (!memories.length) return "none";

  return memories
    .map(
      (memory) =>
        `[${memory.kind}|${memory.scopeType}${memory.scopeValue ? `:${memory.scopeValue}` : ""}] ${memory.title}: ${memory.content}`,
    )
    .join(" || ");
}
