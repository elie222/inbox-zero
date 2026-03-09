// biome-ignore-all lint/suspicious/noMisplacedAssertion: These are assertion helpers called from test blocks
import { expect } from "vitest";
import type { ReplayTestContext } from "./replay-test-context";

export function expectRuleMatched(
  ctx: ReplayTestContext,
  _opts: { ruleName: string },
) {
  const llmCalls = ctx.captured.llmCalls.filter(
    (c) => c.label === "choose-rule",
  );
  expect(llmCalls.length).toBeGreaterThan(0);
}

export function expectMessageLabeled(
  ctx: ReplayTestContext,
  opts: { messageId?: string; label: string },
) {
  const labelCalls = ctx.captured.emailApiCalls.filter(
    (c) => c.method === "labelMessage",
  );
  expect(labelCalls.length).toBeGreaterThan(0);

  if (opts.messageId) {
    const matchingCall = labelCalls.find((c) => {
      const args = c.args as unknown[];
      return args.some(
        (a) =>
          typeof a === "object" &&
          a !== null &&
          "messageId" in a &&
          (a as any).messageId === opts.messageId,
      );
    });
    expect(matchingCall).toBeDefined();
  }
}

export function expectThreadArchived(
  ctx: ReplayTestContext,
  _opts: { threadId: string },
) {
  const archiveCalls = ctx.captured.emailApiCalls.filter(
    (c) => c.method === "archiveThread",
  );
  expect(archiveCalls.length).toBeGreaterThan(0);
}

export function expectDraftCreated(
  ctx: ReplayTestContext,
  _opts?: { subjectContains?: string },
) {
  const draftCalls = ctx.captured.emailApiCalls.filter(
    (c) => c.method === "draftEmail" || c.method === "createDraft",
  );
  expect(draftCalls.length).toBeGreaterThan(0);
}

export function expectToolCalled(
  ctx: ReplayTestContext,
  opts: { tool: string; argsContain?: Record<string, unknown> },
) {
  const toolCalls = ctx.captured.emailApiCalls.filter(
    (c) => c.method === opts.tool,
  );
  expect(
    toolCalls.length,
    `Expected tool "${opts.tool}" to be called`,
  ).toBeGreaterThan(0);
}

export function expectLLMCalledWith(
  ctx: ReplayTestContext,
  opts: { label: string; promptContains?: string },
) {
  const calls = ctx.captured.llmCalls.filter((c) => c.label === opts.label);
  expect(
    calls.length,
    `Expected LLM call with label "${opts.label}"`,
  ).toBeGreaterThan(0);

  if (opts.promptContains) {
    const matching = calls.find((c) =>
      JSON.stringify(c.prompt).includes(opts.promptContains!),
    );
    expect(
      matching,
      `Expected LLM call with label "${opts.label}" containing "${opts.promptContains}"`,
    ).toBeDefined();
  }
}

export function expectLLMCallCount(
  ctx: ReplayTestContext,
  opts: { label: string; count: number },
) {
  const calls = ctx.captured.llmCalls.filter((c) => c.label === opts.label);
  expect(calls.length).toBe(opts.count);
}

export function expectNoUnexpectedActions(ctx: ReplayTestContext) {
  const unexpectedMethods = [
    "sendEmail",
    "replyToEmail",
    "forwardEmail",
    "trashThread",
    "markSpam",
  ];

  for (const method of unexpectedMethods) {
    const calls = ctx.captured.emailApiCalls.filter((c) => c.method === method);
    expect(calls.length, `Unexpected call to ${method}()`).toBe(0);
  }
}
