import { expect, it, vi } from "vitest";
import { createFilingGuard, isReadyForFiling } from "./filing-eligibility";
import type { EmailProvider } from "@/utils/email/types";

it.each([
  [undefined, false],
  [[], false],
  [["INBOX", "UNREAD"], false],
  [["INBOX", "STARRED"], false],
  [["INBOX"], true],
])("checks current inbox/read/flag state: %j", (labelIds, expected) => {
  expect(isReadyForFiling({ labelIds })).toBe(expected);
});

it("rechecks live state rather than trusting the original observation", async () => {
  const getMessage = vi
    .fn()
    .mockResolvedValue({ labelIds: ["INBOX", "UNREAD"] });
  const guard = createFilingGuard(
    { getMessage } as unknown as EmailProvider,
    "message",
  );
  await expect(guard()).rejects.toThrow("Automatic filing deferred");
});

it("holds a thread while another inbox message is unread or flagged", async () => {
  const provider = {
    getMessage: vi
      .fn()
      .mockResolvedValue({ threadId: "thread", labelIds: ["INBOX"] }),
    getThread: vi
      .fn()
      .mockResolvedValue({ messages: [{ labelIds: ["INBOX", "STARRED"] }] }),
  };
  await expect(
    createFilingGuard(provider as unknown as EmailProvider, "message")(),
  ).rejects.toThrow("Automatic filing deferred");
});

it("allows a read, unflagged inbox message with no protected inbox siblings", async () => {
  const provider = {
    getMessage: vi
      .fn()
      .mockResolvedValue({ threadId: "thread", labelIds: ["INBOX"] }),
    getThread: vi.fn().mockResolvedValue({
      messages: [{ labelIds: ["INBOX"] }, { labelIds: ["UNREAD"] }],
    }),
  };
  await expect(
    createFilingGuard(provider as unknown as EmailProvider, "message")(),
  ).resolves.toBeUndefined();
});
