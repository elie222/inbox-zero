import { describe, expect, it, vi } from "vitest";
import { GmailLabel } from "@/utils/gmail/label";
import { markNotSpam, markSpam } from "./spam";

describe("gmail spam mutations", () => {
  it("adds the spam label when marking spam", async () => {
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

  it("removes spam and restores inbox when marking not spam", async () => {
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
});
