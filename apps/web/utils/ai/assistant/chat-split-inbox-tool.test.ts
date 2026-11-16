import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import { createEmailProvider } from "@/utils/email/provider";
import {
  createMailSplitOrThrow,
  deleteMailSplit,
  updateMailSplit,
} from "@/utils/split-inbox/splits.server";
import { manageSplitInboxTool } from "./chat-split-inbox-tool";

vi.mock("@/utils/prisma");
vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/utils/email/provider", () => ({ createEmailProvider: vi.fn() }));
vi.mock("@/utils/split-inbox/splits.server", () => ({
  createMailSplitOrThrow: vi.fn(),
  updateMailSplit: vi.fn(),
  deleteMailSplit: vi.fn(),
}));

const tool = manageSplitInboxTool({
  email: "user@example.com",
  emailAccountId: "account-1",
  provider: "google",
  logger: createTestLogger(),
});

describe("manageSplitInboxTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createEmailProvider).mockResolvedValue({
      getLabels: async () => [{ id: "Label_7", name: "Customers" }],
    } as never);
    vi.mocked(createMailSplitOrThrow).mockImplementation(
      async ({ name }) => ({ id: "split-1", name }) as never,
    );
  });

  it("creates a recipient-domain split, resolving label names to ids", async () => {
    const result = await run({
      action: "create",
      name: "Rakazo",
      matchAll: false,
      conditions: [
        { kind: "TO", value: "@rakazo.com" },
        { kind: "LABEL", value: "customers" },
      ],
    });

    expect(result).toMatchObject({
      success: true,
      split: { id: "split-1", name: "Rakazo" },
    });
    expect(createMailSplitOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [
          { kind: "TO", value: "@rakazo.com" },
          { kind: "LABEL", value: "Label_7" },
        ],
      }),
    );
  });

  it("explains an invalid split instead of creating it", async () => {
    for (const conditions of [
      [{ kind: "LABEL", value: "Nonexistent" }],
      [{ kind: "TO", value: "rakazo.com" }],
      [
        { kind: "TO", value: "a@rakazo.com" },
        { kind: "TO", value: "b@rakazo.com" },
      ],
    ]) {
      const result = await run({ action: "create", name: "Split", conditions });
      expect(result).toMatchObject({ success: false });
      expect((result as { error: string }).error).toBeTruthy();
    }
    expect(createMailSplitOrThrow).not.toHaveBeenCalled();
  });

  it("asks the user to confirm a delete instead of deleting", async () => {
    prisma.mailSplit.findFirst.mockResolvedValue({
      id: "split-1",
      name: "Rakazo",
    } as never);

    const result = await run({ action: "delete", splitId: "split-1" });

    expect(result).toMatchObject({
      success: true,
      requiresConfirmation: true,
      pendingDelete: { id: "split-1", name: "Rakazo" },
    });
    expect(deleteMailSplit).not.toHaveBeenCalled();
  });

  it("renames a split without dropping conditions it was not given", async () => {
    prisma.mailSplit.findFirst.mockResolvedValue({
      name: "Rakazo",
      matchAll: true,
      filters: [{ kind: "TO", value: "@rakazo.com" }],
    } as never);

    const result = await run({
      action: "update",
      splitId: "split-1",
      name: "Rakazo support",
    });

    expect(result).toMatchObject({ success: true });
    expect(updateMailSplit).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      id: "split-1",
      name: "Rakazo support",
      matchAll: true,
      filters: [{ kind: "TO", value: "@rakazo.com" }],
    });
  });
});

function run(input: Record<string, unknown>) {
  return tool.execute?.(
    input as never,
    {
      toolCallId: "call",
      messages: [],
    } as never,
  );
}
