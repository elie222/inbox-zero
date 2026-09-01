import { describe, expect, it, vi, type Mock } from "vitest";
import {
  deleteDraft,
  getDraft,
  getDraftIdForMessage,
} from "@/utils/gmail/draft";
import { GmailLabel } from "@/utils/gmail/label";

vi.mock("@/utils/gmail/retry", () => ({
  withGmailRetry: (fn: () => unknown) => fn(),
}));

vi.mock("@/utils/gmail/message", () => ({
  parseMessage: vi.fn(),
}));

describe("gmail/draft", () => {
  it("getDraft returns null when embedded message is SENT or missing DRAFT label", async () => {
    const gmail = {
      users: {
        drafts: {
          get: vi.fn().mockResolvedValue({
            data: { id: "r-1", message: { id: "m-1", threadId: "t-1" } },
          }),
        },
      },
    } as any;

    const { parseMessage } = await import("@/utils/gmail/message");

    (parseMessage as Mock).mockReturnValueOnce({
      id: "m-1",
      threadId: "t-1",
      labelIds: [GmailLabel.SENT],
    });
    await expect(getDraft("r-1", gmail)).resolves.toBeNull();

    (parseMessage as Mock).mockReturnValueOnce({
      id: "m-1",
      threadId: "t-1",
      labelIds: [],
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

    const { parseMessage } = await import("@/utils/gmail/message");

    (parseMessage as Mock).mockReturnValueOnce({
      id: "m-1",
      threadId: "t-1",
      labelIds: [GmailLabel.DRAFT],
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

  it("getDraftIdForMessage finds a draft across pages", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          drafts: [{ id: "r-1", message: { id: "m-1" } }],
          nextPageToken: "next-page",
        },
      })
      .mockResolvedValueOnce({
        data: { drafts: [{ id: "r-2", message: { id: "m-2" } }] },
      });
    const gmail = { users: { drafts: { list } } } as any;

    await expect(getDraftIdForMessage(gmail, "m-2")).resolves.toBe("r-2");
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("getDraftIdForMessage returns null when the draft is absent", async () => {
    const gmail = {
      users: {
        drafts: {
          list: vi.fn().mockResolvedValue({
            data: { drafts: [{ id: "r-1", message: { id: "m-1" } }] },
          }),
        },
      },
    } as any;

    await expect(getDraftIdForMessage(gmail, "m-2")).resolves.toBeNull();
  });

  it("getDraftIdForMessage stops when a page token repeats", async () => {
    const list = vi.fn().mockResolvedValue({
      data: { drafts: [], nextPageToken: "repeated-page" },
    });
    const gmail = { users: { drafts: { list } } } as any;

    await expect(getDraftIdForMessage(gmail, "m-1")).resolves.toBeNull();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("getDraftIdForMessage bounds the number of pages", async () => {
    let pageNumber = 0;
    const list = vi.fn().mockImplementation(async () => ({
      data: { drafts: [], nextPageToken: `page-${pageNumber++}` },
    }));
    const gmail = { users: { drafts: { list } } } as any;

    await expect(getDraftIdForMessage(gmail, "m-1")).resolves.toBeNull();
    expect(list).toHaveBeenCalledTimes(10);
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

    const { parseMessage } = await import("@/utils/gmail/message");
    (parseMessage as Mock).mockReturnValueOnce({
      id: "m-1",
      threadId: "t-1",
      labelIds: [GmailLabel.SENT],
    });

    await expect(deleteDraft(gmail, "r-1")).resolves.toBe(false);
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

    const { parseMessage } = await import("@/utils/gmail/message");
    (parseMessage as Mock).mockReturnValueOnce({
      id: "m-1",
      threadId: "t-1",
      labelIds: [GmailLabel.DRAFT],
      snippet: "",
      historyId: "1",
      inline: [],
      headers: { from: "a@test.com", to: "b@test.com", subject: "s", date: "" },
      subject: "s",
      date: "",
    });

    await expect(deleteDraft(gmail, "r-1")).resolves.toBe(true);
    expect(draftsDelete).toHaveBeenCalledTimes(1);
  });
});
