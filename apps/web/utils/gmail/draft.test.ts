import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { deleteDraft, getDraft } from "@/utils/gmail/draft";
import { GmailLabel } from "@/utils/gmail/label";
import { parseMessage } from "@/utils/gmail/message";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/gmail/retry", () => ({
  withGmailRetry: (fn: () => unknown) => fn(),
}));

vi.mock("@/utils/gmail/message", () => ({
  parseMessage: vi.fn(),
}));

describe("gmail/draft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getDraft returns null when embedded message is SENT or missing DRAFT label", async () => {
    const gmail = {
      users: {
        drafts: {
          get: vi.fn().mockResolvedValue({
            data: {
              id: "r-1",
              message: {
                id: "m-1",
                threadId: "t-1",
                labelIds: [GmailLabel.SENT],
              },
            },
          }),
        },
      },
    } as any;

    (parseMessage as Mock).mockReturnValueOnce({
      id: "m-1",
      threadId: "t-1",
    });
    await expect(getDraft("r-1", gmail)).resolves.toBeNull();

    // No DRAFT label
    (gmail.users.drafts.get as Mock).mockResolvedValueOnce({
      data: {
        id: "r-1",
        message: { id: "m-1", threadId: "t-1", labelIds: [] },
      },
    });
    (parseMessage as Mock).mockReturnValueOnce({
      id: "m-1",
      threadId: "t-1",
    });
    await expect(getDraft("r-1", gmail)).resolves.toBeNull();
  });

  it("getDraft returns message when embedded message has DRAFT and not SENT", async () => {
    const gmail = {
      users: {
        drafts: {
          get: vi.fn().mockResolvedValue({
            data: { id: "r-1", message: { id: "m-1", threadId: "t-1" } },
          }),
        },
      },
    } as any;

    // Provide labelIds on the raw message, since parseMessage may not preserve them.
    (gmail.users.drafts.get as Mock).mockResolvedValueOnce({
      data: {
        id: "r-1",
        message: { id: "m-1", threadId: "t-1", labelIds: [GmailLabel.DRAFT] },
      },
    });

    (parseMessage as Mock).mockReturnValueOnce({
      id: "m-1",
      threadId: "t-1",
      snippet: "",
      historyId: "1",
      inline: [],
      headers: { from: "a@test.com", to: "b@test.com", subject: "s", date: "" },
      subject: "s",
      date: "",
    });

    const result = await getDraft("r-1", gmail);
    expect(result).not.toBeNull();
    expect(result?.labelIds).toEqual([GmailLabel.DRAFT]);
  });

  it("deleteDraft skips drafts.delete when getDraft returns null", async () => {
    const draftsDelete = vi.fn().mockResolvedValue({ status: 204 });
    const gmail = {
      users: {
        drafts: {
          get: vi.fn().mockResolvedValue({
            data: { id: "r-1", message: { id: "m-1", threadId: "t-1" } },
          }),
          delete: draftsDelete,
        },
      },
    } as any;

    // Raw message indicates SENT, so getDraft should return null.
    (gmail.users.drafts.get as Mock).mockResolvedValueOnce({
      data: {
        id: "r-1",
        message: { id: "m-1", threadId: "t-1", labelIds: [GmailLabel.SENT] },
      },
    });
    (parseMessage as Mock).mockReturnValueOnce({
      id: "m-1",
      threadId: "t-1",
    });

    await deleteDraft(gmail, "r-1");
    expect(draftsDelete).not.toHaveBeenCalled();
  });

  it("deleteDraft calls drafts.delete when getDraft returns a real draft", async () => {
    const draftsDelete = vi.fn().mockResolvedValue({ status: 204 });
    const gmail = {
      users: {
        drafts: {
          get: vi.fn().mockResolvedValue({
            data: { id: "r-1", message: { id: "m-1", threadId: "t-1" } },
          }),
          delete: draftsDelete,
        },
      },
    } as any;

    // Raw message indicates DRAFT, so delete should proceed.
    (gmail.users.drafts.get as Mock).mockResolvedValueOnce({
      data: {
        id: "r-1",
        message: { id: "m-1", threadId: "t-1", labelIds: [GmailLabel.DRAFT] },
      },
    });
    (parseMessage as Mock).mockReturnValueOnce({
      id: "m-1",
      threadId: "t-1",
      snippet: "",
      historyId: "1",
      inline: [],
      headers: { from: "a@test.com", to: "b@test.com", subject: "s", date: "" },
      subject: "s",
      date: "",
    });

    await deleteDraft(gmail, "r-1");
    expect(draftsDelete).toHaveBeenCalledTimes(1);
  });
});
