import { beforeEach, describe, expect, it, vi } from "vitest";
import { GmailLabel } from "@/utils/gmail/label";
import { markNotSpam, markSpam } from "./spam";

vi.mock("@/utils/gmail/label", () => ({
  GmailLabel: {
    INBOX: "INBOX",
    SPAM: "SPAM",
    TRASH: "TRASH",
  },
  getLabel: vi.fn(),
  getOrCreateLabel: vi.fn(),
}));

import { getLabel, getOrCreateLabel } from "@/utils/gmail/label";

describe("gmail spam mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds the spam label when marking spam without reviewLabel", async () => {
    const modify = vi.fn().mockResolvedValue({});
    await markSpam({
      gmail: { users: { threads: { modify } } } as never,
      threadId: "thread-1",
    });
    expect(modify).toHaveBeenCalledWith({
      userId: "me",
      id: "thread-1",
      requestBody: {
        addLabelIds: [GmailLabel.SPAM],
      },
    });
  });

  it("applies review label and removes INBOX when marking spam with reviewLabel", async () => {
    vi.mocked(getOrCreateLabel).mockResolvedValue({
      id: "label-review-id",
      name: "Review/Delete",
    });
    const modify = vi.fn().mockResolvedValue({});
    const gmail = { users: { threads: { modify } } } as never;

    await markSpam({
      gmail,
      threadId: "thread-1",
      reviewLabel: "Review/Delete",
    });

    expect(getOrCreateLabel).toHaveBeenCalledWith({
      gmail,
      name: "Review/Delete",
    });
    expect(modify).toHaveBeenCalledWith({
      userId: "me",
      id: "thread-1",
      requestBody: {
        addLabelIds: ["label-review-id"],
        removeLabelIds: [GmailLabel.INBOX],
      },
    });
  });

  it("removes spam and restores inbox when marking not spam without reviewLabel", async () => {
    const modify = vi.fn().mockResolvedValue({});
    await markNotSpam({
      gmail: { users: { threads: { modify } } } as never,
      threadId: "thread-1",
    });
    expect(modify).toHaveBeenCalledWith({
      userId: "me",
      id: "thread-1",
      requestBody: {
        addLabelIds: [GmailLabel.INBOX],
        removeLabelIds: [GmailLabel.SPAM],
      },
    });
  });

  it("removes review label and restores inbox when marking not spam with reviewLabel", async () => {
    vi.mocked(getLabel).mockResolvedValue({
      id: "label-review-id",
      name: "Review/Delete",
    });
    const modify = vi.fn().mockResolvedValue({});
    const gmail = { users: { threads: { modify } } } as never;

    await markNotSpam({
      gmail,
      threadId: "thread-1",
      reviewLabel: "Review/Delete",
    });

    expect(getLabel).toHaveBeenCalledWith({
      gmail,
      name: "Review/Delete",
    });
    expect(modify).toHaveBeenCalledWith({
      userId: "me",
      id: "thread-1",
      requestBody: {
        addLabelIds: [GmailLabel.INBOX],
        removeLabelIds: ["label-review-id", GmailLabel.SPAM],
      },
    });
  });
});
