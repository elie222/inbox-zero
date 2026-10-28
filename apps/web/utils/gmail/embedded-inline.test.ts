import type { gmail_v1 } from "@googleapis/gmail";
import { describe, expect, it, vi } from "vitest";
import { parseMessage } from "./message";
import { getGmailAttachment, getGmailAttachmentStream } from "./attachment";
import { parsedMessageBodyObservation } from "@/utils/mail-api/observations";
import type { MessageWithPayload } from "@/utils/types";

describe("embedded Gmail inline MIME images", () => {
  it("hydrates authoritative nested MIME part IDs and fetches the actual bytes, never a filename match", async () => {
    const bytes = Buffer.from([0, 128, 255, 22, 10]);
    const message = rawMessage(bytes);
    const parsed = parseMessage(message);
    const body = parsedMessageBodyObservation("account", parsed);
    const image = body?.attachments.find(
      (part) => part.contentId === "logo@example.test",
    );
    expect(image).toMatchObject({
      attachmentId: "gmail-part:1.2",
      inline: true,
      filename: "same.png",
    });
    const get = vi.fn().mockResolvedValue({ data: message });
    const getAttachment = vi.fn();
    const gmail = {
      users: { messages: { get, attachments: { get: getAttachment } } },
    } as unknown as gmail_v1.Gmail;
    const stream = await getGmailAttachmentStream(
      gmail,
      "message",
      image!.attachmentId,
    );
    expect(Buffer.from(await new Response(stream).arrayBuffer())).toEqual(
      bytes,
    );
    expect(get).toHaveBeenCalledWith(
      { userId: "me", id: "message", format: "full" },
      { signal: undefined },
    );
    expect(getAttachment).not.toHaveBeenCalled();
    expect(
      (await getGmailAttachment(gmail, "message", image!.attachmentId)).data,
    ).toBe(bytes.toString("base64url"));
  });

  it("supports an authoritative empty root MIME part ID", async () => {
    const bytes = Buffer.from("root bytes");
    const message = {
      id: "message",
      payload: {
        partId: "",
        mimeType: "image/png",
        filename: "root.png",
        headers: [{ name: "Content-ID", value: "<root@example.test>" }],
        body: { data: bytes.toString("base64url"), size: bytes.length },
      },
    };
    const body = parsedMessageBodyObservation("account", parseMessage(message));
    expect(body?.attachments[0]).toMatchObject({
      attachmentId: "gmail-part:",
      contentId: "root@example.test",
      inline: true,
    });
    const gmail = {
      users: {
        messages: { get: vi.fn().mockResolvedValue({ data: message }) },
      },
    } as unknown as gmail_v1.Gmail;
    const stream = await getGmailAttachmentStream(
      gmail,
      "message",
      body!.attachments[0].attachmentId,
    );
    expect(Buffer.from(await new Response(stream).arrayBuffer())).toEqual(
      bytes,
    );
  });

  it("fails a removed or non-embedded part instead of loading another part with the same filename", async () => {
    const message = rawMessage(Buffer.from("image"));
    const gmail = {
      users: {
        messages: { get: vi.fn().mockResolvedValue({ data: message }) },
      },
    } as unknown as gmail_v1.Gmail;
    await expect(
      getGmailAttachmentStream(gmail, "message", "gmail-part:9"),
    ).rejects.toMatchObject({ code: 404 });
    message.payload.parts![1].parts![1].body = {
      attachmentId: "native-id",
      size: 5,
    };
    await expect(
      getGmailAttachmentStream(gmail, "message", "gmail-part:1.2"),
    ).rejects.toMatchObject({ code: 404 });
  });

  it("does not return embedded bytes after cancellation while the provider is responding", async () => {
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const get = vi.fn(async () => {
      await delayed;
      return { data: rawMessage(Buffer.from("late")) };
    });
    const gmail = { users: { messages: { get } } } as unknown as gmail_v1.Gmail;
    const controller = new AbortController();
    const pending = getGmailAttachmentStream(
      gmail,
      "message",
      "gmail-part:1.2",
      controller.signal,
    );
    const rejected = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    controller.abort();
    release();
    await rejected;
  });
});

function rawMessage(bytes: Buffer): MessageWithPayload {
  return {
    id: "message",
    threadId: "thread",
    payload: {
      partId: "",
      mimeType: "multipart/related",
      parts: [
        {
          partId: "0",
          mimeType: "text/html",
          body: {
            data: Buffer.from(
              '<p>Text</p><img src="cid:logo@example.test">',
            ).toString("base64url"),
          },
        },
        {
          partId: "1",
          mimeType: "multipart/related",
          parts: [
            {
              partId: "1.1",
              mimeType: "image/png",
              filename: "same.png",
              headers: [
                { name: "Content-ID", value: "<different@example.test>" },
              ],
              body: {
                data: Buffer.from("other bytes").toString("base64url"),
                size: 11,
              },
            },
            {
              partId: "1.2",
              mimeType: "image/png",
              filename: "same.png",
              headers: [{ name: "Content-ID", value: "<logo@example.test>" }],
              body: { data: bytes.toString("base64url"), size: bytes.length },
            },
          ],
        },
      ],
    },
  };
}
