import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import { createEmailProvider } from "@/utils/email/provider";
import { manageLabelsTool } from "./chat-label-tools";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/email/provider");
vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: vi.fn().mockResolvedValue(undefined),
}));

const logger = createScopedLogger("chat-label-tools-test");

describe("chat label tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists labels with an optional query filter", async () => {
    vi.mocked(createEmailProvider).mockResolvedValue({
      getLabels: vi.fn().mockResolvedValue([
        { id: "label-1", name: "Finance", type: "user" },
        { id: "label-2", name: "Receipts", type: "user" },
      ]),
    } as any);

    const toolInstance = manageLabelsTool({
      email: "sender@example.com",
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "list",
      query: "fin",
    });

    expect(result).toEqual({
      action: "list",
      totalCount: 1,
      returnedCount: 1,
      truncated: false,
      labels: [{ id: "label-1", name: "Finance", type: "user" }],
    });
  });

  it("returns an existing exact label before creating a new one", async () => {
    const getLabels = vi
      .fn()
      .mockResolvedValue([{ id: "label-1", name: "Finance", type: "user" }]);
    const createLabel = vi.fn().mockResolvedValue({
      id: "label-2",
      name: "Finance",
      type: "user",
    });

    vi.mocked(createEmailProvider).mockResolvedValue({
      getLabels,
      createLabel,
    } as any);

    const toolInstance = manageLabelsTool({
      email: "sender@example.com",
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const existingResult = await (toolInstance.execute as any)({
      action: "createOrGet",
      name: " finance ",
    });

    expect(existingResult).toEqual({
      action: "createOrGet",
      created: false,
      label: { id: "label-1", name: "Finance", type: "user" },
    });
    expect(createLabel).not.toHaveBeenCalled();

    getLabels.mockResolvedValueOnce([]);

    const createdResult = await (toolInstance.execute as any)({
      action: "createOrGet",
      name: "Finance",
    });

    expect(createLabel).toHaveBeenCalledWith("Finance");
    expect(createdResult).toEqual({
      action: "createOrGet",
      created: true,
      label: { id: "label-2", name: "Finance", type: "user" },
    });
  });
});
