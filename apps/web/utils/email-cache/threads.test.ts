import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import {
  clearEmailCache,
  clearEmailCacheForAccount,
  getEmailCacheDatabase,
} from "./database";
import { readCachedThreadDetail, writeCachedThreadDetail } from "./threads";

describe("cached thread details", () => {
  beforeEach(async () => {
    await clearEmailCache();
  });

  it("isolates thread response variants", async () => {
    await writeCachedThreadDetail({
      emailAccountId: "account-1",
      threadId: "thread-1",
      variant: "drafts:0|replies:0",
      data: getThreadResponse({ textPlain: "without drafts" }),
    });

    await expect(
      readCachedThreadDetail({
        emailAccountId: "account-1",
        threadId: "thread-1",
        variant: "drafts:1|replies:0",
      }),
    ).resolves.toBeUndefined();
  });

  it("clears one account without affecting another", async () => {
    for (const emailAccountId of ["account-1", "account-2"]) {
      await writeCachedThreadDetail({
        emailAccountId,
        threadId: "thread-1",
        variant: "drafts:0|replies:0",
        data: getThreadResponse({ textPlain: emailAccountId }),
      });
    }

    await clearEmailCacheForAccount("account-1");

    await expect(
      readCachedThreadDetail({
        emailAccountId: "account-1",
        threadId: "thread-1",
        variant: "drafts:0|replies:0",
      }),
    ).resolves.toBeUndefined();
    await expect(
      readCachedThreadDetail({
        emailAccountId: "account-2",
        threadId: "thread-1",
        variant: "drafts:0|replies:0",
      }),
    ).resolves.toMatchObject({
      data: { thread: { messages: [{ textPlain: "account-2" }] } },
    });
  });

  it("rejects writes started while an account clear is in progress", async () => {
    const clearing = clearEmailCacheForAccount("account-1");
    const writing = writeCachedThreadDetail({
      emailAccountId: "account-1",
      threadId: "thread-1",
      variant: "drafts:0|replies:0",
      data: getThreadResponse({ textPlain: "late response" }),
    });

    await Promise.all([clearing, writing]);

    await expect(
      readCachedThreadDetail({
        emailAccountId: "account-1",
        threadId: "thread-1",
        variant: "drafts:0|replies:0",
      }),
    ).resolves.toBeUndefined();
  });

  it("does not return expired thread details", async () => {
    await writeCachedThreadDetail({
      emailAccountId: "account-1",
      threadId: "thread-1",
      variant: "drafts:0|replies:0",
      data: getThreadResponse({ textPlain: "Expired" }),
      now: Date.now() - 31 * 24 * 60 * 60 * 1000,
    });

    await expect(
      readCachedThreadDetail({
        emailAccountId: "account-1",
        threadId: "thread-1",
        variant: "drafts:0|replies:0",
      }),
    ).resolves.toBeUndefined();
  });

  it("stores only the reader fields and attachment metadata", async () => {
    await writeCachedThreadDetail({
      emailAccountId: "account-1",
      threadId: "thread-1",
      variant: "drafts:0|replies:0",
      data: getThreadResponseWithExtraFields(),
    });

    const cached = await readCachedThreadDetail({
      emailAccountId: "account-1",
      threadId: "thread-1",
      variant: "drafts:0|replies:0",
    });

    expect(cached).toMatchObject({
      data: {
        thread: {
          historyId: "history-1",
          id: "thread-1",
          messages: [
            {
              attachments: [
                {
                  attachmentId: "attachment-1",
                  filename: "report.pdf",
                  mimeType: "application/pdf",
                  size: 10,
                },
              ],
              headers: {
                date: "2026-08-23T10:00:00.000Z",
                from: "sender@example.com",
                subject: "Subject",
                to: "me@example.com",
              },
              id: "message-1",
              inline: [
                {
                  attachmentId: "inline-1",
                  filename: "inline.png",
                  mimeType: "image/png",
                  size: 12,
                },
              ],
              textPlain: "Body",
            },
          ],
          snippet: "snippet",
        },
      },
    });
    expect(
      (cached?.data.thread as Record<string, unknown>).providerOnlyField,
    ).toBeUndefined();
    expect(
      (cached?.data.thread.messages[0] as Record<string, unknown>)
        .extraMessageField,
    ).toBeUndefined();
    expect(
      (
        cached?.data.thread.messages[0]?.attachments?.[0] as Record<
          string,
          unknown
        >
      ).content,
    ).toBeUndefined();
  });

  it("rewrites legacy thread detail records with sanitized data and byte size", async () => {
    const legacy = getThreadResponseWithExtraFields();
    const expected = getSanitizedThreadResponse();

    await seedLegacyThreadDetailRecord({
      byteSize: JSON.stringify(legacy).length,
      data: legacy,
      emailAccountId: "account-1",
      threadId: "thread-1",
      variant: "drafts:0|replies:0",
    });

    const cached = await readCachedThreadDetail({
      emailAccountId: "account-1",
      threadId: "thread-1",
      variant: "drafts:0|replies:0",
    });

    expect(cached).toMatchObject({
      byteSize: JSON.stringify(expected).length,
      data: expected,
    });

    const persisted = await getPersistedThreadDetailRecord({
      emailAccountId: "account-1",
      threadId: "thread-1",
      variant: "drafts:0|replies:0",
    });

    expect(persisted).toMatchObject({
      byteSize: JSON.stringify(expected).length,
      data: expected,
    });
    expect(
      (
        persisted?.data as {
          thread?: Record<string, unknown>;
        }
      ).thread?.providerOnlyField,
    ).toBeUndefined();
    expect(
      (
        (
          persisted?.data as {
            thread?: { messages?: Array<Record<string, unknown>> };
          }
        ).thread?.messages?.[0]?.attachments?.[0] as Record<string, unknown>
      ).content,
    ).toBeUndefined();
  });

  // A record outlives the server behaviour that wrote it, so a thread stored
  // while Outlook still returned newest-first has to be reordered on read
  // rather than replayed in the order it was persisted.
  it("orders a legacy record that was stored newest-first", async () => {
    await seedLegacyThreadDetailRecord({
      byteSize: 0,
      data: getThreadResponseWithMessages([
        { id: "newest", internalDate: "2026-08-27T10:00:00.000Z" },
        { id: "middle", internalDate: "2026-08-26T10:00:00.000Z" },
        { id: "oldest", internalDate: "2026-08-25T10:00:00.000Z" },
      ]),
      emailAccountId: "account-1",
      threadId: "thread-1",
      variant: "drafts:0|replies:0",
    });

    const cached = await readCachedThreadDetail({
      emailAccountId: "account-1",
      threadId: "thread-1",
      variant: "drafts:0|replies:0",
    });

    expect(cached?.data.thread.messages.map((message) => message.id)).toEqual([
      "oldest",
      "middle",
      "newest",
    ]);
  });

  it("orders messages when writing a thread to the cache", async () => {
    await writeCachedThreadDetail({
      emailAccountId: "account-1",
      threadId: "thread-1",
      variant: "drafts:0|replies:0",
      data: getThreadResponseWithMessages([
        { id: "newest", internalDate: "2026-08-27T10:00:00.000Z" },
        { id: "oldest", internalDate: "2026-08-25T10:00:00.000Z" },
      ]),
    });

    const cached = await readCachedThreadDetail({
      emailAccountId: "account-1",
      threadId: "thread-1",
      variant: "drafts:0|replies:0",
    });

    expect(cached?.data.thread.messages.map((message) => message.id)).toEqual([
      "oldest",
      "newest",
    ]);
  });

  // Gmail reports epoch milliseconds where Outlook reports an ISO string.
  it("orders messages across both internalDate formats", async () => {
    await seedLegacyThreadDetailRecord({
      byteSize: 0,
      data: getThreadResponseWithMessages([
        { id: "newest", internalDate: "1788000000000" },
        { id: "oldest", internalDate: "2026-08-25T10:00:00.000Z" },
      ]),
      emailAccountId: "account-1",
      threadId: "thread-1",
      variant: "drafts:0|replies:0",
    });

    const cached = await readCachedThreadDetail({
      emailAccountId: "account-1",
      threadId: "thread-1",
      variant: "drafts:0|replies:0",
    });

    expect(cached?.data.thread.messages.map((message) => message.id)).toEqual([
      "oldest",
      "newest",
    ]);
  });
});

function getThreadResponseWithMessages(
  messages: Array<{ id: string; internalDate: string }>,
): ThreadResponse {
  return {
    thread: {
      historyId: "history-1",
      id: "thread-1",
      messages: messages.map(({ id, internalDate }) => ({
        date: internalDate,
        headers: {
          date: internalDate,
          from: "sender@example.com",
          subject: "Subject",
          to: "me@example.com",
        },
        historyId: "history-1",
        id,
        inline: [],
        internalDate,
        snippet: id,
        subject: "Subject",
        textPlain: id,
        threadId: "thread-1",
      })),
      snippet: messages.at(-1)?.id ?? "",
    },
  };
}

function getThreadResponse({
  textPlain,
}: {
  textPlain: string;
}): ThreadResponse {
  const date = "2026-08-23T10:00:00.000Z";
  return {
    thread: {
      historyId: "history-1",
      id: "thread-1",
      messages: [
        {
          date,
          headers: {
            date,
            from: "sender@example.com",
            subject: "Subject",
            to: "me@example.com",
          },
          historyId: "history-1",
          id: "message-1",
          inline: [],
          snippet: textPlain,
          subject: "Subject",
          textPlain,
          threadId: "thread-1",
        },
      ],
      snippet: textPlain,
    },
  };
}

function getThreadResponseWithExtraFields(): ThreadResponse {
  const date = "2026-08-23T10:00:00.000Z";
  return {
    thread: {
      historyId: "history-1",
      id: "thread-1",
      messages: [
        {
          attachments: [
            {
              attachmentId: "attachment-1",
              content: "base64-payload",
              filename: "report.pdf",
              headers: {
                "content-description": "report",
                "content-disposition": "attachment",
                "content-id": "attachment-content-id",
                "content-transfer-encoding": "base64",
                "content-type": "application/pdf",
                ignored: "value",
              },
              mimeType: "application/pdf",
              size: 10,
            },
          ],
          date,
          extraMessageField: "remove-me",
          headers: {
            date,
            from: "sender@example.com",
            subject: "Subject",
            to: "me@example.com",
            unknown: "value",
          },
          historyId: "history-1",
          id: "message-1",
          inline: [
            {
              attachmentId: "inline-1",
              data: "inline-payload",
              filename: "inline.png",
              headers: {
                "content-description": "inline",
                "content-id": "inline-content-id",
                "content-transfer-encoding": "base64",
                "content-type": "image/png",
                ignored: "value",
              },
              mimeType: "image/png",
              size: 12,
            },
          ],
          labelIds: ["INBOX"],
          snippet: "snippet",
          subject: "Subject",
          textPlain: "Body",
          threadId: "thread-1",
        },
      ],
      providerOnlyField: "remove-me",
      snippet: "snippet",
    },
  } as ThreadResponse;
}

function getSanitizedThreadResponse(): ThreadResponse {
  return {
    thread: {
      historyId: "history-1",
      id: "thread-1",
      messages: [
        {
          attachments: [
            {
              attachmentId: "attachment-1",
              filename: "report.pdf",
              headers: {
                "content-description": "report",
                "content-disposition": "attachment",
                "content-id": "attachment-content-id",
                "content-transfer-encoding": "base64",
                "content-type": "application/pdf",
              },
              mimeType: "application/pdf",
              size: 10,
            },
          ],
          date: "2026-08-23T10:00:00.000Z",
          headers: {
            date: "2026-08-23T10:00:00.000Z",
            from: "sender@example.com",
            subject: "Subject",
            to: "me@example.com",
          },
          historyId: "history-1",
          id: "message-1",
          inline: [
            {
              attachmentId: "inline-1",
              filename: "inline.png",
              headers: {
                "content-description": "inline",
                "content-id": "inline-content-id",
                "content-transfer-encoding": "base64",
                "content-type": "image/png",
              },
              mimeType: "image/png",
              size: 12,
            },
          ],
          labelIds: ["INBOX"],
          snippet: "snippet",
          subject: "Subject",
          textPlain: "Body",
          threadId: "thread-1",
        },
      ],
      snippet: "snippet",
    },
  };
}

async function seedLegacyThreadDetailRecord({
  byteSize,
  data,
  emailAccountId,
  threadId,
  variant,
}: {
  byteSize: number;
  data: ThreadResponse;
  emailAccountId: string;
  threadId: string;
  variant: string;
}) {
  const database = await getEmailCacheDatabase();
  if (!database) throw new Error("Expected email cache database");
  const now = Date.now();

  await database.put("threadDetails", {
    byteSize,
    data,
    emailAccountId,
    fetchedAt: now,
    lastAccessedAt: now,
    threadId,
    variant,
  });
}

async function getPersistedThreadDetailRecord({
  emailAccountId,
  threadId,
  variant,
}: {
  emailAccountId: string;
  threadId: string;
  variant: string;
}) {
  const database = await getEmailCacheDatabase();
  if (!database) throw new Error("Expected email cache database");

  return database.get("threadDetails", [emailAccountId, threadId, variant]);
}
