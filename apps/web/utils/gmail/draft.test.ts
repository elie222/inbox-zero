import { describe, expect, it, vi, type Mock } from "vitest";
import { deleteDraft, getDraft } from "@/utils/gmail/draft";
import { GmailLabel } from "@/utils/gmail/label";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/logger", () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    with: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      trace: vi.fn(),
    }),
  }),
}));

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

    await deleteDraft(gmail, "r-1");
    expect(draftsDelete).toHaveBeenCalledTimes(1);
  });
});
