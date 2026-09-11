import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type QueueMetadata = {
  deliveryCount: number;
  messageId: string;
};

type QueueCallback = (
  message: unknown,
  metadata: QueueMetadata,
) => Promise<void>;

const {
  captureExceptionMock,
  executeAutomationJobRunMock,
  handleCallbackMock,
} = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
  executeAutomationJobRunMock: vi.fn(),
  handleCallbackMock: vi.fn((callback: QueueCallback) => callback),
}));

vi.mock("@vercel/queue", () => ({
  handleCallback: handleCallbackMock,
}));

vi.mock("@/utils/error", () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));

vi.mock("@/utils/automation-jobs/execute", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/utils/automation-jobs/execute")>();

  return {
    ...actual,
    executeAutomationJobRun: (...args: unknown[]) =>
      executeAutomationJobRunMock(...args),
  };
});

import "./route";

const queueCallback = handleCallbackMock.mock.calls[0]?.[0] as
  | QueueCallback
  | undefined;

describe("automation job queue route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ignores invalid queue payloads without executing a job run", async () => {
    if (!queueCallback) {
      throw new Error("Queue callback was not registered");
    }

    await expect(
      queueCallback(
        { automationJobRunId: "" },
        { deliveryCount: 1, messageId: "queue-message-1" },
      ),
    ).resolves.toBeUndefined();

    expect(executeAutomationJobRunMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });
});
