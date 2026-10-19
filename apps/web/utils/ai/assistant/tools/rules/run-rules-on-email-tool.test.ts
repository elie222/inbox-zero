import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { runRulesOnMessage } from "@/utils/ai/choose-rule/run-rules-on-message";
import { runRulesOnEmailTool } from "./run-rules-on-email-tool";

vi.mock("@/utils/ai/choose-rule/run-rules-on-message", () => ({
  runRulesOnMessage: vi.fn(),
}));
vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: vi.fn().mockResolvedValue(undefined),
}));

const logger = createTestLogger();

const matchedResult = {
  rule: { name: "Newsletters" },
  reason: "Looks like a digest",
  status: "APPLIED",
  createdAt: new Date("2026-10-19T00:00:00.000Z"),
  actionItems: [
    { type: "LABEL", label: "Newsletter" },
    { type: "MOVE_FOLDER", folderName: "Reading" },
  ],
};

describe("runRulesOnEmailTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("previews with isTest true and reports the planned actions", async () => {
    vi.mocked(runRulesOnMessage).mockResolvedValue([matchedResult] as any);

    const result = await execute({ messageId: "msg-1", apply: false });

    expect(runRulesOnMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account-1",
        provider: "google",
        messageId: "msg-1",
        isTest: true,
      }),
    );
    expect(result).toEqual({
      messageId: "msg-1",
      preview: true,
      results: [
        {
          ruleName: "Newsletters",
          reason: "Looks like a digest",
          status: "APPLIED",
          alreadyProcessed: false,
          actions: [
            { type: "LABEL", label: "Newsletter", folderName: null },
            { type: "MOVE_FOLDER", label: null, folderName: "Reading" },
          ],
        },
      ],
    });
  });

  it("applies with isTest false", async () => {
    vi.mocked(runRulesOnMessage).mockResolvedValue([matchedResult] as any);

    const result = await execute({ messageId: "msg-1", apply: true });

    expect(runRulesOnMessage).toHaveBeenCalledWith(
      expect.objectContaining({ isTest: false }),
    );
    expect(result).toMatchObject({ preview: false });
  });

  it("returns the existing result for an already-processed message", async () => {
    vi.mocked(runRulesOnMessage).mockResolvedValue([
      { ...matchedResult, existing: true },
    ] as any);

    const result = await execute({ messageId: "msg-1", apply: true });

    expect(result).toMatchObject({
      results: [{ ruleName: "Newsletters", alreadyProcessed: true }],
    });
  });

  it("reports no matching rule with a null rule name", async () => {
    vi.mocked(runRulesOnMessage).mockResolvedValue([
      { rule: null, reason: "No rule matched", status: "SKIPPED" },
    ] as any);

    const result = await execute({ messageId: "msg-1", apply: false });

    expect(result).toMatchObject({
      results: [{ ruleName: null, actions: [] }],
    });
  });

  it("returns an error when the message cannot be loaded", async () => {
    vi.mocked(runRulesOnMessage).mockRejectedValue(new Error("not found"));

    const result = await execute({ messageId: "missing", apply: false });

    expect(result).toEqual({ error: "Failed to run rules on email" });
  });
});

function execute(input: { messageId: string; apply: boolean }) {
  const instance = runRulesOnEmailTool({
    email: "user@example.com",
    emailAccountId: "account-1",
    provider: "google",
    logger,
  });
  return instance.execute!(input, {
    toolCallId: "call-1",
    messages: [],
  } as any);
}
