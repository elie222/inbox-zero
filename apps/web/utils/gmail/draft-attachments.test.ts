import { gmail_v1 } from "@googleapis/gmail";
import PostalMime from "postal-mime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type DraftMessageUploadPart,
  encodeMimeBase64,
} from "@/utils/email/draft-attachment-upload";
import {
  buildGmailDraftUploadTemplate,
  rewriteGmailDraft,
} from "./draft-attachments";
import { listGmailAttachmentParts } from "./attachment";

const getDraft = vi.hoisted(() => vi.fn());
vi.mock("@/utils/gmail/draft", () => ({ getDraft }));

const EXISTING_BYTES = Buffer.from("existing report bytes");
const NEW_BYTES = Buffer.from(
  Uint8Array.from({ length: 5000 }, (_, index) => (index * 7) % 256),
);

describe("buildGmailDraftUploadTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDraft.mockResolvedValue(draftWithReport());
  });

  it("builds a message the browser completes with only the attachment bytes", async () => {
    const template = await buildGmailDraftUploadTemplate({
      gmail: new gmail_v1.Gmail({}),
      draftId: "r-1",
      attachment: {
        id: "new-image",
        filename: "photo.png",
        mimeType: "image/png",
        size: NEW_BYTES.length,
        disposition: "inline",
        contentId: "new-image@inboxzero.local",
      },
    });

    const slots = template.parts.filter((part) => part.type === "attachment");
    expect(slots).toHaveLength(2);
    expect(slots).toContainEqual({
      type: "attachment",
      attachmentId: "existing-1",
      size: EXISTING_BYTES.length,
      source: { messageId: "message-1", providerAttachmentId: "gmail-att-1" },
    });
    expect(slots).toContainEqual({
      type: "attachment",
      attachmentId: "new-image",
      size: NEW_BYTES.length,
    });

    const raw = assemble(template.parts, {
      "existing-1": EXISTING_BYTES,
      "new-image": NEW_BYTES,
    });
    expect(raw.length).toBe(template.totalBytes);

    const email = await PostalMime.parse(raw);
    expect(email.subject).toBe("Quarterly update");
    expect(email.to?.[0]?.address).toBe("recipient@example.com");
    expect(email.html).toContain("Draft body");
    const report = email.attachments.find(
      (file) => file.filename === "report.pdf",
    );
    const photo = email.attachments.find(
      (file) => file.filename === "photo.png",
    );
    expect(Buffer.from(report!.content as ArrayBuffer)).toEqual(EXISTING_BYTES);
    expect(Buffer.from(photo!.content as ArrayBuffer)).toEqual(NEW_BYTES);
    expect(photo?.contentId).toBe("<new-image@inboxzero.local>");
    expect(photo?.disposition).toBe("inline");
    expect(raw).toMatch(/X-Attachment-Id: existing-1/i);
    expect(raw).toMatch(/X-Attachment-Id: new-image/i);
  });
});

describe("rewriteGmailDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDraft.mockResolvedValue(draftWithReport());
  });

  it("adds a file while keeping the draft's other files and their ids", async () => {
    const gmail = gmailClient();
    await rewriteGmailDraft({
      gmail,
      draftId: "r-1",
      addAttachment: {
        id: "new-file",
        filename: "notes.txt",
        mimeType: "text/plain",
        size: 5,
        disposition: "attachment",
        content: Buffer.from("notes"),
      },
    });

    const call = vi.mocked(gmail.users.drafts.update).mock
      .calls[0]![0] as unknown as {
      id: string;
      requestBody: { message: { threadId: string } };
      media: { mimeType: string; body: NodeJS.ReadableStream };
    };
    expect(call.id).toBe("r-1");
    expect(call.requestBody.message.threadId).toBe("thread-1");
    expect(call.media.mimeType).toBe("message/rfc822");
    const raw = await readStream(call.media.body);
    const email = await PostalMime.parse(raw);
    expect(email.attachments.map((file) => file.filename).sort()).toEqual([
      "notes.txt",
      "report.pdf",
    ]);
    expect(raw).toMatch(/X-Attachment-Id: existing-1/i);
    expect(raw).toMatch(/X-Attachment-Id: new-file/i);
  });

  it("removes only the requested file", async () => {
    const gmail = gmailClient();
    await rewriteGmailDraft({
      gmail,
      draftId: "r-1",
      removeAttachmentId: "existing-1",
    });
    const raw = await readStream(uploadedBody(gmail));
    expect(raw).not.toContain("report.pdf");
    expect(raw).toContain("Draft body");
  });

  it("refuses to remove a file the draft doesn't hold", async () => {
    const gmail = gmailClient();
    await expect(
      rewriteGmailDraft({ gmail, draftId: "r-1", removeAttachmentId: "gone" }),
    ).rejects.toThrow("no longer on the draft");
    expect(gmail.users.drafts.update).not.toHaveBeenCalled();
  });

  it("keeps the id of a file another client attached across a text save", async () => {
    const draft = draftWithReport();
    // Gmail's own attachment ids run to hundreds of characters.
    draft.payload.parts[1] = {
      ...draft.payload.parts[1]!,
      headers: [{ name: "Content-Disposition", value: "attachment" }],
      body: { attachmentId: "A".repeat(300), size: EXISTING_BYTES.length },
    };
    getDraft.mockResolvedValue(draft);
    const [listed] = listGmailAttachmentParts(draft.id, draft.payload);

    const gmail = gmailClient();
    await rewriteGmailDraft({
      gmail,
      draftId: "r-1",
      text: { messageHtml: "<p>Edited</p>" },
    });
    const raw = await readStream(uploadedBody(gmail));
    expect(raw.toLowerCase()).toContain(
      `x-attachment-id: ${listed!.attachment.id}`,
    );

    await expect(
      rewriteGmailDraft({
        gmail: gmailClient(),
        draftId: "r-1",
        removeAttachmentId: listed!.attachment.id,
      }),
    ).resolves.not.toThrow();
  });

  it("gives an identical file from another client its own id", async () => {
    const draft = draftWithReport();
    const external = (headers: { name: string; value: string }[]) => ({
      ...draft.payload.parts[1]!,
      headers: [
        { name: "Content-Disposition", value: "attachment" },
        ...headers,
      ],
      body: { attachmentId: "A".repeat(300), size: EXISTING_BYTES.length },
    });
    const [first] = listGmailAttachmentParts(draft.id, {
      ...draft.payload,
      parts: [draft.payload.parts[0]!, external([])],
    });
    // The first copy was rebuilt and carries its id; a second copy arrives.
    const ids = listGmailAttachmentParts(draft.id, {
      ...draft.payload,
      parts: [
        draft.payload.parts[0]!,
        external([{ name: "X-Attachment-Id", value: first!.attachment.id }]),
        external([]),
      ],
    }).map((part) => part.attachment.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("keeps a plain-text draft as plain text when its files change", async () => {
    getDraft.mockResolvedValue({
      ...draftWithReport(),
      textHtml: undefined,
      textPlain: "Plain draft body",
    });
    const gmail = gmailClient();
    await rewriteGmailDraft({
      gmail,
      draftId: "r-1",
      removeAttachmentId: "existing-1",
    });
    const email = await PostalMime.parse(await readStream(uploadedBody(gmail)));
    expect(email.text?.trim()).toBe("Plain draft body");
    expect(email.html).toBeUndefined();
  });

  it("keeps an attached email out of base64", async () => {
    const gmail = gmailClient();
    await rewriteGmailDraft({
      gmail,
      draftId: "r-1",
      addAttachment: {
        id: "forwarded-email",
        filename: "note.eml",
        mimeType: "message/rfc822",
        size: 30,
        disposition: "attachment",
        content: Buffer.from("Subject: Hi\r\n\r\nForwarded body"),
      },
    });
    const raw = await readStream(uploadedBody(gmail));
    // Readable in the message itself, so not base64-encoded.
    expect(raw).toContain("Forwarded body");
  });
});

function draftWithReport() {
  const payload: gmail_v1.Schema$MessagePart & {
    parts: gmail_v1.Schema$MessagePart[];
  } = {
    mimeType: "multipart/mixed",
    parts: [
      {
        partId: "0",
        mimeType: "text/html",
        body: {
          data: Buffer.from("<p>Draft body</p>").toString("base64url"),
        },
      },
      {
        partId: "1",
        mimeType: "application/pdf",
        filename: "report.pdf",
        headers: [
          { name: "Content-Disposition", value: "attachment" },
          { name: "X-Attachment-Id", value: "existing-1" },
        ],
        body: { attachmentId: "gmail-att-1", size: EXISTING_BYTES.length },
      },
    ],
  };
  return {
    id: "message-1",
    threadId: "thread-1",
    subject: "Quarterly update",
    textHtml: "<p>Draft body</p>",
    headers: {
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Quarterly update",
    },
    payload,
  };
}

function gmailClient() {
  const gmail = new gmail_v1.Gmail({});
  gmail.users.drafts.update = vi.fn().mockResolvedValue({ data: {} }) as never;
  gmail.users.messages.attachments.get = vi.fn().mockResolvedValue({
    data: { data: EXISTING_BYTES.toString("base64url") },
  }) as never;
  return gmail;
}

function assemble(
  parts: DraftMessageUploadPart[],
  files: Record<string, Buffer>,
) {
  return parts
    .map((part) =>
      part.type === "text"
        ? part.text
        : encodeMimeBase64(files[part.attachmentId]!),
    )
    .join("");
}

async function readStream(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString();
}

function uploadedBody(gmail: gmail_v1.Gmail) {
  const call = vi.mocked(gmail.users.drafts.update).mock
    .calls[0]![0] as unknown as { media: { body: NodeJS.ReadableStream } };
  return call.media.body;
}
