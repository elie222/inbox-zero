import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import { createEmailProvider } from "@/utils/email/provider";
import { createOrGetLabelTool, listLabelsTool } from "./chat-label-tools";

vi.mock("server-only", () => ({}));
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
    vi.mocked(createEmailProvider).mockResolvedValue({
      getLabels: vi.fn().mockResolvedValue([
        { id: "label-1", name: "Work-Items_/2026.Report", type: "user" },
        { id: "label-2", name: "Receipts", type: "user" },
      ]),
    } as any);

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

    vi.mocked(createEmailProvider).mockResolvedValue({
      getLabels,
      createLabel,
    } as any);

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

    getLabels.mockResolvedValueOnce([]);

    const createdResult = await (toolInstance.execute as any)({
      name: "Work-Items_/2026.Report",
    });

    expect(createLabel).toHaveBeenCalledWith("Work-Items_/2026.Report");
    expect(createdResult).toEqual({
      created: true,
      label: {
        id: "label-2",
        name: "Work-Items_/2026.Report",
        type: "user",
      },
    });
  });
});
