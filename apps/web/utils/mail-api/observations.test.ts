import { describe, expect, it } from "vitest";
import {
  parsedMessageBodyObservation,
  parsedMessageMetadata,
} from "./observations";
import { bodyObservationSchema } from "@inboxzero/mail-core/sync";
import type { ParsedMessage } from "@/utils/types";

describe("parsedMessageMetadata", () => {
  it("maps Gmail system labels into roles and read/starred flags", () => {
    const metadata = parsedMessageMetadata({
      id: "m1",
      threadId: "t1",
      historyId: "1",
      date: "2026-01-01T00:00:00.000Z",
      internalDate: "1735689600000",
      subject: "Hello",
      snippet: "Hi",
      labelIds: ["INBOX", "UNREAD", "STARRED", "CATEGORY_UPDATES", "Label_2"],
      headers: { from: "ada@example.com", to: "me@example.com", date: "" },
      inline: [],
    } as ParsedMessage);
    expect(metadata.roles).toEqual(["inbox"]);
    expect(metadata.read).toBe(false);
    expect(metadata.starred).toBe(true);
    expect(metadata.categoryIds).toEqual(["CATEGORY_UPDATES"]);
    expect(metadata.labelIds).toEqual(["Label_2"]);
  });

  it("maps Outlook folder identity into mailbox roles when labels are absent", () => {
    const metadata = parsedMessageMetadata({
      id: "m2",
      threadId: "t2",
      historyId: "1",
      date: "2026-01-01T00:00:00.000Z",
      parentFolderId: "inbox",
      subject: "Hello",
      snippet: "Hi",
      externalUrl: "https://outlook.office.com/mail/deeplink/read/m2",
      inboxSection: "focused",
      labelIds: ["UNREAD"],
      headers: { from: "ada@example.com", to: "me@example.com", date: "" },
      inline: [],
    } as ParsedMessage);
    expect(metadata.roles).toEqual(["inbox"]);
    expect(metadata.read).toBe(false);
    expect(metadata.externalUrl).toBe(
      "https://outlook.office.com/mail/deeplink/read/m2",
    );
    expect(metadata.inboxSection).toBe("focused");
  });

  it("does not keep the inbox role on archived mail", () => {
    const metadata = parsedMessageMetadata({
      id: "m3",
      threadId: "t3",
      historyId: "1",
      date: "2026-01-01T00:00:00.000Z",
      parentFolderId: "AAMk-inbox-archive",
      subject: "Hello",
      snippet: "Hi",
      labelIds: ["ARCHIVE", "UNREAD"],
      headers: { from: "ada@example.com", to: "me@example.com", date: "" },
      inline: [],
    } as ParsedMessage);
    expect(metadata.roles).toEqual([]);
    expect(metadata.read).toBe(false);
  });
});

describe("parsedMessageBodyObservation", () => {
  it("leaves out attachments the provider sent without an id", () => {
    const observation = parsedMessageBodyObservation("acc-1", {
      id: "m4",
      threadId: "t4",
      historyId: "5",
      date: "2026-01-01T00:00:00.000Z",
      subject: "Hello",
      snippet: "Hi",
      labelIds: ["INBOX"],
      headers: { from: "ada@example.com", to: "me@example.com", date: "" },
      textHtml: "<p>Hi</p>",
      attachments: [
        {
          attachmentId: "att-1",
          filename: "report.pdf",
          mimeType: "application/pdf",
          size: 10,
          headers: {},
        },
      ],
      inline: [
        {
          filename: "logo.png",
          mimeType: "image/png",
          size: 20,
          headers: {},
        },
      ],
    } as unknown as ParsedMessage);
    expect(observation?.attachments?.map((a) => a.attachmentId)).toEqual([
      "att-1",
    ]);
    expect(() => bodyObservationSchema.parse(observation)).not.toThrow();
  });

  it("keeps attachment descriptors and meeting flags with enumerated bodies", () => {
    expect(
      parsedMessageBodyObservation("acc-1", {
        id: "m3",
        threadId: "t3",
        historyId: "4",
        date: "2026-01-01T00:00:00.000Z",
        subject: "Invite",
        snippet: "Meet",
        textPlain: "Meet",
        isMeetingInvitation: true,
        attachments: [
          {
            attachmentId: "att-1",
            filename: "invite.ics",
            mimeType: "text/calendar",
            size: 80,
            headers: {
              "content-description": "",
              "content-id": "",
              "content-transfer-encoding": "base64",
              "content-type": "text/calendar",
            },
          },
        ],
        headers: { from: "ada@example.com", to: "me@example.com", date: "" },
        inline: [],
      } as ParsedMessage),
    ).toEqual({
      key: { accountId: "acc-1", messageId: "m3" },
      version: "4",
      html: null,
      text: "Meet",
      attachments: [
        {
          attachmentId: "att-1",
          filename: "invite.ics",
          mimeType: "text/calendar",
          size: 80,
          inline: false,
        },
      ],
      isMeetingInvitation: true,
    });
  });
});
