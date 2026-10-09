import PostalMime from "postal-mime";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  encodeMimeBase64,
  GMAIL_UPLOAD_CHUNK_BYTES,
  GRAPH_UPLOAD_CHUNK_BYTES,
} from "@/utils/email/draft-attachment-upload";
import { uploadGmailDraftChunk } from "@/utils/gmail/resumable-draft-upload";
import {
  createGmailTestHarness,
  createOutlookTestHarness,
  type GmailTestHarness,
  type OutlookTestHarness,
} from "./helpers";

vi.mock("server-only", () => ({}));

const gmailRoot = vi.hoisted(() => ({ url: "" }));
vi.mock("@/utils/gmail/oauth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/gmail/oauth")>()),
  getGoogleGmailApiRootUrl: () => gmailRoot.url,
}));

const SMALL = Buffer.from("small attachment bytes");
const LARGE = Buffer.from(
  Uint8Array.from({ length: 3 * 1024 * 1024 + 1234 }, (_, i) => (i * 13) % 256),
);

describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)(
  "Gmail draft attachments",
  { timeout: 60_000 },
  () => {
    const email = "gmail-draft-attachments@example.com";
    let harness: GmailTestHarness;

    beforeAll(async () => {
      harness = await createGmailTestHarness({ email, messages: [] });
      gmailRoot.url = harness.emulator.url;
    });

    afterAll(async () => {
      await harness?.emulator.close();
    });

    it("adds, uploads, removes, and sends files on the mailbox draft", async () => {
      const { provider } = harness;
      const { id: draftId } = await provider.createDraft({
        to: "",
        subject: "Files",
        messageHtml: "<p>See attached</p>",
      });

      const added = await provider.addDraftAttachment(draftId, {
        id: "small-file",
        filename: "small.txt",
        mimeType: "text/plain",
        size: SMALL.length,
        disposition: "attachment",
        content: SMALL,
      });
      expect(added.attachments.map((file) => file.id)).toEqual(["small-file"]);

      const upload = await provider.startDraftAttachmentUpload(draftId, {
        id: "large-file",
        filename: "large.bin",
        mimeType: "application/octet-stream",
        size: LARGE.length,
        disposition: "attachment",
      });
      if (upload.type !== "gmail-message") throw new Error(upload.type);
      const message = Buffer.from(
        (
          await Promise.all(
            upload.parts.map(async (part) => {
              if (part.type === "text") return part.text;
              if (!part.source) return encodeMimeBase64(LARGE);
              const stream = await provider.getAttachmentStream(
                part.source.messageId,
                part.source.providerAttachmentId,
              );
              return encodeMimeBase64(
                new Uint8Array(await new Response(stream).arrayBuffer()),
              );
            }),
          )
        ).join(""),
        "latin1",
      );
      expect(message.length).toBe(upload.totalBytes);
      let start = 0;
      while (start < message.length) {
        const end = Math.min(start + GMAIL_UPLOAD_CHUNK_BYTES, message.length);
        const result = await uploadGmailDraftChunk({
          accessToken: provider.getAccessToken(),
          sessionUri: upload.sessionUri,
          start,
          bytes: new Uint8Array(message.subarray(start, end)),
          totalBytes: message.length,
        });
        if (result.status === "complete") break;
        start = result.nextOffset;
      }

      const listed = await provider.getDraftAttachments(draftId);
      expect(listed?.attachments.map((file) => file.id).sort()).toEqual([
        "large-file",
        "small-file",
      ]);

      const removed = await provider.removeDraftAttachment(
        draftId,
        "small-file",
      );
      expect(removed.attachments.map((file) => file.id)).toEqual([
        "large-file",
      ]);

      await provider.updateDraft(draftId, {
        to: "recipient@example.com",
        subject: "Files",
        messageHtml: "<p>Final text</p>",
      });
      const sent = await provider.sendDraft(draftId);
      const raw = await harness.gmailClient.users.messages.get({
        userId: "me",
        id: sent.messageId,
        format: "raw",
      });
      const parsed = await PostalMime.parse(
        Buffer.from(raw.data.raw!, "base64url"),
      );
      expect(parsed.html).toContain("Final text");
      expect(parsed.attachments.map((file) => file.filename)).toEqual([
        "large.bin",
      ]);
      expect(
        Buffer.from(parsed.attachments[0]!.content as ArrayBuffer),
      ).toEqual(LARGE);
    });
  },
);

describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)(
  "Outlook draft attachments",
  { timeout: 60_000 },
  () => {
    const email = "outlook-draft-attachments@example.com";
    let harness: OutlookTestHarness;

    beforeAll(async () => {
      harness = await createOutlookTestHarness({ email, messages: [] });
    });

    afterAll(async () => {
      harness?.restoreFetch();
      await harness?.emulator.close();
    });

    it("adds small files directly and large files through the upload URL", async () => {
      const { provider } = harness;
      const { id: draftId } = await provider.createDraft({
        to: "recipient@example.com",
        subject: "Files",
        messageHtml: '<p>See <img src="cid:photo@inboxzero.local"></p>',
      });

      const added = await provider.addDraftAttachment(draftId, {
        id: "photo",
        filename: "photo.png",
        mimeType: "image/png",
        size: SMALL.length,
        disposition: "inline",
        contentId: "photo@inboxzero.local",
        content: SMALL,
      });
      expect(added.attachments).toEqual([
        expect.objectContaining({
          id: added.attachmentId,
          disposition: "inline",
          contentId: "photo@inboxzero.local",
        }),
      ]);

      const upload = await provider.startDraftAttachmentUpload(draftId, {
        id: "large-file",
        filename: "large.bin",
        mimeType: "application/octet-stream",
        size: LARGE.length,
        disposition: "attachment",
      });
      if (upload.type !== "provider-url") throw new Error(upload.type);
      let response: Response | undefined;
      for (
        let start = 0;
        start < LARGE.length;
        start += GRAPH_UPLOAD_CHUNK_BYTES
      ) {
        const end = Math.min(start + GRAPH_UPLOAD_CHUNK_BYTES, LARGE.length);
        response = await fetch(upload.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Range": `bytes ${start}-${end - 1}/${LARGE.length}`,
          },
          body: LARGE.subarray(start, end),
        });
        expect(response.ok).toBe(true);
      }
      const largeId = response?.headers
        .get("location")
        ?.match(/Attachments\('([^']+)'\)/)?.[1];
      expect(largeId).toBeTruthy();

      await provider.removeDraftAttachment(draftId, added.attachmentId);
      const listed = await provider.getDraftAttachments(draftId);
      expect(listed?.attachments.map((file) => file.id)).toEqual([largeId]);

      await provider.updateDraft(draftId, { messageHtml: "<p>Final</p>" });
      const sent = await provider.sendDraft(draftId);
      const stream = await provider.getAttachmentStream(
        sent.messageId,
        largeId!,
      );
      expect(Buffer.from(await new Response(stream).arrayBuffer())).toEqual(
        LARGE,
      );
    });
  },
);
