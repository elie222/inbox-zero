import { ResponseType } from "@microsoft/microsoft-graph-client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createOutlookTestHarness, type OutlookTestHarness } from "./helpers";

vi.mock("server-only", () => ({}));

const EMAIL = "outlook-attachment@example.com";
const CONTENT = Buffer.from([0, 1, 127, 128, 255, 10]);

describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)(
  "Outlook attachment streams",
  { timeout: 30_000 },
  () => {
    let harness: OutlookTestHarness;
    let attachmentId: string;
    let messageId: string;
    let otherMessageId: string;

    beforeAll(async () => {
      harness = await createOutlookTestHarness({
        email: EMAIL,
        messages: ["attachment-message", "other-message"].map((id) => ({
          microsoft_id: id,
          conversation_id: `${id}-thread`,
          user_email: EMAIL,
          from: { address: "ada@example.com" },
          to_recipients: [{ address: EMAIL }],
          subject: id,
          body_content: "Attachment test",
          parent_folder_id: "inbox",
          received_date_time: "2026-09-18T12:00:00Z",
        })),
      });
      const messages = await harness.graphClient.api("/me/messages").get();
      messageId = messages.value.find(
        (message: { subject: string }) =>
          message.subject === "attachment-message",
      ).id;
      otherMessageId = messages.value.find(
        (message: { subject: string }) => message.subject === "other-message",
      ).id;
      const attachment = await harness.graphClient
        .api(`/me/messages/${messageId}/attachments`)
        .post({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: "binary.dat",
          contentType: "application/octet-stream",
          contentBytes: CONTENT.toString("base64"),
        });
      attachmentId = attachment.id;
    });

    afterAll(async () => {
      harness?.restoreFetch();
      await harness?.emulator.close();
    });

    it("streams the original binary bytes with their content type", async () => {
      const response: Response = await harness.graphClient
        .api(`/me/messages/${messageId}/attachments/${attachmentId}/$value`)
        .responseType(ResponseType.RAW)
        .get();
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "application/octet-stream",
      );
      expect(response.headers.get("content-length")).toBe(
        String(CONTENT.length),
      );
      expect(Buffer.from(await response.arrayBuffer())).toEqual(CONTENT);

      const stream = await harness.provider.getAttachmentStream(
        messageId,
        attachmentId,
      );
      expect(Buffer.from(await new Response(stream).arrayBuffer())).toEqual(
        CONTENT,
      );
    });

    it.each([
      ["attachment-message", "missing-attachment"],
      ["other-message", "existing"],
    ])("rejects an attachment outside its message: %s/%s", async (message, id) => {
      await expect(
        harness.provider.getAttachmentStream(
          message === "attachment-message" ? messageId : otherMessageId,
          id === "existing" ? attachmentId : id,
        ),
      ).rejects.toMatchObject({ status: 404 });
    });
  },
);
