import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockEmailAccountWithAccount } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { applyThreadLabelsAction } from "@/utils/actions/mail-label";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));
const { modify, getLabel } = vi.hoisted(() => ({
  modify: vi.fn(),
  getLabel: vi.fn(),
}));
vi.mock("@/utils/email-account-client", () => ({
  getGmailClientForEmail: vi.fn(async () => ({
    users: { threads: { modify }, labels: { get: getLabel } },
  })),
}));

describe("manual thread labels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findUnique.mockResolvedValue(
      getMockEmailAccountWithAccount({
        email: "user@example.com",
        userId: "user-1",
        provider: "google",
      }),
    );
    getLabel.mockResolvedValue({
      data: { id: "label-1", name: "Projects", type: "user" },
    });
    modify.mockResolvedValue({ data: {} });
  });

  it("adds a label to each whole conversation without removing inbox or other labels", async () => {
    const result = await applyThreadLabelsAction("account-1", {
      threadIds: ["thread-1", "thread-2", "thread-1"],
      labelId: "label-1",
    });
    expect(result?.data).toEqual({
      succeededThreadIds: ["thread-1", "thread-2"],
      failedThreadIds: [],
    });
    expect(modify).toHaveBeenCalledTimes(2);
    for (const id of ["thread-1", "thread-2"]) {
      expect(modify).toHaveBeenCalledWith({
        userId: "me",
        id,
        requestBody: { addLabelIds: ["label-1"], removeLabelIds: undefined },
      });
    }
  });

  it("reports partial failures so successful conversations are not retried", async () => {
    modify.mockRejectedValueOnce(new Error("Invalid request"));
    const result = await applyThreadLabelsAction("account-1", {
      threadIds: ["thread-1", "thread-2"],
      labelId: "label-1",
    });
    expect(result?.data).toEqual({
      succeededThreadIds: ["thread-2"],
      failedThreadIds: ["thread-1"],
    });
  });

  it("rejects system labels before modifying conversations", async () => {
    getLabel.mockResolvedValue({ data: { id: "TRASH", type: "system" } });
    const result = await applyThreadLabelsAction("account-1", {
      threadIds: ["thread-1"],
      labelId: "TRASH",
    });
    expect(result?.serverError).toBe("Select a user-created Gmail label.");
    expect(modify).not.toHaveBeenCalled();
  });

  it("rejects unsupported accounts", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(
      getMockEmailAccountWithAccount({
        email: "user@example.com",
        userId: "user-1",
        provider: "microsoft",
      }),
    );
    const result = await applyThreadLabelsAction("account-1", {
      threadIds: ["thread-1"],
      labelId: "label-1",
    });
    expect(result?.serverError).toBe(
      "Manual labeling is available for Gmail accounts.",
    );
    expect(modify).not.toHaveBeenCalled();
  });
});
