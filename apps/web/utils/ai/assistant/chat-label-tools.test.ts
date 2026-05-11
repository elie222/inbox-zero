import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import { createScopedLogger } from "@/utils/logger";
import { createEmailProvider } from "@/utils/email/provider";
import { createOrGetLabelTool, listLabelsTool } from "./chat-label-tools";

vi.mock("@/utils/email/provider");
vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: vi.fn().mockResolvedValue(undefined),
}));

const logger = createScopedLogger("chat-label-tools-test");
const TEST_EMAIL = "user@test.com";

describe("chat label tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists all labels without filtering or limiting", async () => {
    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getLabels: vi.fn().mockResolvedValue([
          { id: "label-1", name: "Work-Items_/2026.Report", type: "user" },
          { id: "label-2", name: "Receipts", type: "user" },
        ]),
      }),
    );

    const toolInstance = listLabelsTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({});

    expect(result).toEqual({
      labels: [
        { id: "label-1", name: "Work-Items_/2026.Report", type: "user" },
        { id: "label-2", name: "Receipts", type: "user" },
      ],
    });
  });

  it("returns an existing normalized label before creating a new one", async () => {
    const getLabels = vi
      .fn()
      .mockResolvedValue([
        { id: "label-1", name: "Work-Items_/2026.Report", type: "user" },
      ]);
    const createLabel = vi.fn().mockResolvedValue({
      id: "label-2",
      name: "Work-Items_/2026.Report",
      type: "user",
    });

    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getLabels,
        createLabel,
      }),
    );

    const toolInstance = createOrGetLabelTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const existingResult = await (toolInstance.execute as any)({
      name: " work items /2026 report ",
    });

    expect(existingResult).toEqual({
      created: false,
      label: {
        id: "label-1",
        name: "Work-Items_/2026.Report",
        type: "user",
      },
    });
    expect(createLabel).not.toHaveBeenCalled();
    expect(getLabels).toHaveBeenCalledTimes(1);
    expect(getLabels).toHaveBeenCalledWith();
  });

  it("creates a label when no visible or hidden normalized match exists", async () => {
    const getLabels = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const createLabel = vi.fn().mockResolvedValue({
      id: "label-2",
      name: "Work-Items_/2026.Report",
      type: "user",
    });

    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getLabels,
        createLabel,
      }),
    );

    const toolInstance = createOrGetLabelTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      name: "Work-Items_/2026.Report",
    });

    expect(createLabel).toHaveBeenCalledWith("Work-Items_/2026.Report");
    expect(result).toEqual({
      created: true,
      label: {
        id: "label-2",
        name: "Work-Items_/2026.Report",
        type: "user",
      },
    });
    expect(getLabels).toHaveBeenCalledTimes(2);
    expect(getLabels).toHaveBeenNthCalledWith(1);
    expect(getLabels).toHaveBeenNthCalledWith(2, { includeHidden: true });
  });

  it("reuses a hidden normalized label before creating a new one", async () => {
    const getLabels = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "label-hidden",
          name: "Foo-Bar",
          type: "user",
          labelListVisibility: "labelHide",
        },
      ]);
    const createLabel = vi.fn();

    vi.mocked(createEmailProvider).mockResolvedValue(
      createMockEmailProvider({
        getLabels,
        createLabel,
      }),
    );

    const toolInstance = createOrGetLabelTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      name: "foo bar",
    });

    expect(result).toEqual({
      created: false,
      label: {
        id: "label-hidden",
        name: "Foo-Bar",
        type: "user",
      },
    });
    expect(createLabel).not.toHaveBeenCalled();
    expect(getLabels).toHaveBeenCalledTimes(2);
    expect(getLabels).toHaveBeenNthCalledWith(1);
    expect(getLabels).toHaveBeenNthCalledWith(2, { includeHidden: true });
  });
});
