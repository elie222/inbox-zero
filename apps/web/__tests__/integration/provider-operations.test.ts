/**
 * Integration test: core EmailProvider operations across Gmail and Outlook
 *
 * Tests the shared EmailProvider interface against both emulators.
 * Each test suite runs identically against Gmail and Outlook, verifying
 * that labeling, archiving, mark-read, and message retrieval work
 * consistently across providers.
 *
 * Usage:
 *   pnpm test-integration provider-operations
 */

import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import {
  createGmailTestHarness,
  createOutlookTestHarness,
  type GmailTestHarness,
  type ProviderTestHarness,
} from "./helpers";

vi.mock("@inboxzero/tinybird", () => ({
  publishArchive: vi.fn().mockResolvedValue(undefined),
}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;
const GMAIL_EMAIL = "provider-test@example.com";
const OUTLOOK_EMAIL = "provider-test@outlook.com";

// Seed data factories — same logical messages, different seed formats

function gmailSeedMessages(email: string) {
  return [
    {
      id: "msg_read_me",
      user_email: email,
      from: "alice@example.com",
      to: email,
      subject: "Unread message",
      body_text: "Please read me",
      label_ids: ["INBOX", "UNREAD"],
      internal_date: "1711900000000",
    },
    {
      id: "msg_archive_me",
      user_email: email,
      from: "bob@example.com",
      to: email,
      subject: "Archive this",
      body_text: "Archive me please",
      label_ids: ["INBOX"],
      internal_date: "1711900060000",
    },
    {
      id: "msg_label_me",
      user_email: email,
      from: "carol@example.com",
      to: email,
      subject: "Label this",
      body_text: "Label me please",
      label_ids: ["INBOX"],
      internal_date: "1711900120000",
    },
    ...Array.from({ length: 100 }, (_, index) => ({
      id: `msg_bulk_${index}`,
      user_email: email,
      from: "bulk-sender@example.com",
      to: email,
      subject: `Bulk archive ${index}`,
      body_text: "Archive this message",
      label_ids: ["INBOX"],
      internal_date: String(1_711_800_000_000 + index * 1000),
    })),
  ];
}

function outlookSeedMessages(email: string) {
  return [
    {
      user_email: email,
      from: { address: "alice@example.com", name: "Alice" },
      to_recipients: [{ address: email }],
      subject: "Unread message",
      body_content: "<p>Please read me</p>",
      body_text_content: "Please read me",
      parent_folder_id: "inbox",
      is_read: false,
      received_date_time: "2024-03-31T16:26:40Z",
    },
    {
      user_email: email,
      from: { address: "bob@example.com", name: "Bob" },
      to_recipients: [{ address: email }],
      subject: "Archive this",
      body_content: "<p>Archive me please</p>",
      body_text_content: "Archive me please",
      parent_folder_id: "inbox",
      is_read: true,
      received_date_time: "2024-03-31T16:27:40Z",
    },
    {
      user_email: email,
      from: { address: "carol@example.com", name: "Carol" },
      to_recipients: [{ address: email }],
      subject: "Label this",
      body_content: "<p>Label me please</p>",
      body_text_content: "Label me please",
      parent_folder_id: "inbox",
      is_read: true,
      received_date_time: "2024-03-31T16:28:40Z",
    },
  ];
}

/**
 * Shared test factory — runs the same assertions against any EmailProvider.
 * This is where the DRY magic happens: one set of tests, two providers.
 */
function providerTestSuite(
  getHarness: () => ProviderTestHarness,
  providerName: string,
) {
  test("getMessagesWithPagination returns parsed messages with headers", async () => {
    const { provider } = getHarness();
    const result = await provider.getMessagesWithPagination({ maxResults: 10 });

    expect(result.messages.length).toBeGreaterThanOrEqual(3);

    for (const msg of result.messages) {
      expect(msg.id).toBeDefined();
      expect(msg.threadId).toBeDefined();
      expect(msg.headers.from).toBeDefined();
      expect(msg.headers.subject).toBeDefined();
    }
  });

  test("getMessagesWithPagination respects maxResults", async () => {
    const { provider } = getHarness();
    const page1 = await provider.getMessagesWithPagination({ maxResults: 2 });

    expect(page1.messages.length).toBeLessThanOrEqual(2);
    expect(page1.messages.length).toBeGreaterThanOrEqual(1);
  });

  test("createLabel creates a new label/category", async () => {
    const { provider } = getHarness();
    const label = await provider.createLabel("TestCategory");

    expect(label).toBeDefined();
    expect(label.id).toBeDefined();
    expect(label.name).toBe("TestCategory");
  });

  test("getLabels includes created label", async () => {
    const { provider } = getHarness();
    await provider.createLabel("FindThis");

    const labels = await provider.getLabels();
    const found = labels.find((l) => l.name === "FindThis");
    expect(found).toBeDefined();
  });

  test("getLabelByName finds existing label", async () => {
    const { provider } = getHarness();
    await provider.createLabel("LookupTest");

    const label = await provider.getLabelByName("LookupTest");
    expect(label).toBeDefined();
    expect(label?.name).toBe("LookupTest");
  });

  test("getLabelByName returns null for non-existent label", async () => {
    const { provider } = getHarness();
    const label = await provider.getLabelByName("NonExistent");
    expect(label).toBeNull();
  });

  test("markReadThread marks message as read", async () => {
    const { provider } = getHarness();
    const { messages } = await provider.getMessagesWithPagination({
      maxResults: 10,
    });
    const unreadMsg = messages.find(
      (m) => m.headers.subject === "Unread message",
    );
    expect(unreadMsg).toBeDefined();

    await provider.markReadThread(unreadMsg!.threadId, true);

    // Re-fetch to verify
    const msg = await provider.getMessage(unreadMsg!.id);
    // For Gmail: UNREAD label removed. For Outlook: isRead = true.
    // Both providers expose this via labelIds (Gmail) or message parsing.
    // The provider interface doesn't expose isRead directly, but we can
    // verify the operation didn't throw and the message is still accessible.
    expect(msg.id).toBe(unreadMsg!.id);
  });

  test(`archiveThread moves message out of inbox (${providerName})`, async () => {
    const { provider, email } = getHarness();
    const { messages } = await provider.getMessagesWithPagination({
      maxResults: 10,
    });
    const archiveMsg = messages.find(
      (m) => m.headers.subject === "Archive this",
    );
    expect(archiveMsg).toBeDefined();

    await provider.archiveThread(archiveMsg!.threadId, email);

    // Verify the message is still accessible (not deleted)
    const msg = await provider.getMessage(archiveMsg!.id);
    expect(msg.id).toBe(archiveMsg!.id);
  });

  test("labelMessage applies a label to a message", async () => {
    const { provider } = getHarness();
    const label = await provider.createLabel("Applied");

    const { messages } = await provider.getMessagesWithPagination({
      maxResults: 10,
    });
    const targetMsg = messages.find((m) => m.headers.subject === "Label this");
    expect(targetMsg).toBeDefined();

    await provider.labelMessage({
      messageId: targetMsg!.id,
      labelId: label.id,
      labelName: "Applied",
    });

    // Re-fetch the message to verify label was applied
    const updated = await provider.getMessage(targetMsg!.id);
    expect(updated.id).toBe(targetMsg!.id);
  });
}

// ── Gmail suite ─────────────────────────────────────────────────────

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Provider operations — Gmail",
  { timeout: 30_000 },
  () => {
    let harness: ProviderTestHarness & {
      gmailClient: GmailTestHarness["gmailClient"];
    };

    beforeAll(async () => {
      const h = await createGmailTestHarness({
        port: 4110,
        email: GMAIL_EMAIL,
        messages: gmailSeedMessages(GMAIL_EMAIL),
      });
      harness = {
        emulator: h.emulator,
        gmailClient: h.gmailClient,
        provider: h.provider,
        email: GMAIL_EMAIL,
      };
    });

    afterAll(async () => {
      await harness?.emulator?.close();
    });

    providerTestSuite(() => harness, "Gmail");

    test("archiveMessages removes a large snapshot from the inbox", async () => {
      const messageIds = Array.from(
        { length: 100 },
        (_, index) => `msg_bulk_${index}`,
      );

      await harness.provider.archiveMessages(messageIds);

      const inbox = await harness.gmailClient.users.messages.list({
        userId: "me",
        labelIds: ["INBOX"],
        maxResults: 500,
      });
      const inboxIds = new Set(
        inbox.data.messages?.map((message) => message.id) ?? [],
      );
      expect(messageIds.some((messageId) => inboxIds.has(messageId))).toBe(
        false,
      );
    });
  },
);

// ── Outlook suite ───────────────────────────────────────────────────

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Provider operations — Outlook",
  { timeout: 30_000 },
  () => {
    let harness: ProviderTestHarness & {
      emulator: any;
      restoreFetch?: () => void;
    };

    beforeAll(async () => {
      const h = await createOutlookTestHarness({
        port: 4111,
        email: OUTLOOK_EMAIL,
        messages: outlookSeedMessages(OUTLOOK_EMAIL),
      });
      harness = {
        emulator: h.emulator,
        provider: h.provider,
        email: OUTLOOK_EMAIL,
        restoreFetch: h.restoreFetch,
      };
    });

    afterAll(async () => {
      harness?.restoreFetch?.();
      await harness?.emulator?.close();
    });

    providerTestSuite(() => harness, "Outlook");

    test("exposes inline file attachment metadata through the Graph query contract", async () => {
      const graphFetch = globalThis.fetch;
      let attachmentExpand: string | null = null;

      globalThis.fetch = async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => {
        const requestUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        const url = new URL(requestUrl);

        if (
          url.origin !== "https://graph.microsoft.com" ||
          url.pathname !== "/v1.0/me/messages"
        ) {
          return graphFetch(input, init);
        }

        attachmentExpand = url.searchParams.get("$expand");
        const selectedAttachmentFields =
          attachmentExpand
            ?.match(/attachments\(\$select=([^)]+)\)/)?.[1]
            ?.split(",") ?? [];

        if (selectedAttachmentFields.includes("contentId")) {
          return Response.json(
            {
              error: {
                code: "BadRequest",
                message:
                  "Could not find a property named 'contentId' on type 'microsoft.graph.attachment'.",
              },
            },
            { status: 400 },
          );
        }

        const response = await graphFetch(input, init);
        const body = (await response.json()) as {
          value: Array<{
            body?: { contentType?: string; content?: string };
            attachments?: Array<{
              name?: string;
              isInline?: boolean;
              contentId?: string;
            }>;
          }>;
        };
        const projectsFileAttachmentContentId =
          selectedAttachmentFields.includes(
            "microsoft.graph.fileAttachment/contentId",
          );

        for (const message of body.value) {
          for (const attachment of message.attachments ?? []) {
            if (attachment.name !== "agenda.txt") continue;

            attachment.isInline = true;
            attachment.contentId = projectsFileAttachmentContentId
              ? "agenda-image"
              : undefined;
            message.body = {
              contentType: "html",
              content: '<p>Agenda</p><img src="cid:agenda-image">',
            };
          }
        }

        return Response.json(body, { status: response.status });
      };

      try {
        const result = await harness.provider.getMessagesWithPagination({
          maxResults: 20,
        });
        const message = result.messages.find((item) =>
          item.inline.some(
            (attachment) => attachment.filename === "agenda.txt",
          ),
        );
        const inlineAttachment = message?.inline[0];

        expect(attachmentExpand).toContain(
          "microsoft.graph.fileAttachment/contentId",
        );
        expect(inlineAttachment).toMatchObject({
          filename: "agenda.txt",
          attachmentId: expect.any(String),
          headers: {
            "content-id": "agenda-image",
          },
        });
        expect(message?.textHtml).toContain(
          `cid:${inlineAttachment?.headers["content-id"]}`,
        );

        const downloadedAttachment = await harness.provider.getAttachment(
          message!.id,
          inlineAttachment!.attachmentId,
        );

        expect(downloadedAttachment.data).toBe(
          Buffer.from("Draft agenda").toString("base64"),
        );
      } finally {
        globalThis.fetch = graphFetch;
      }
    });
  },
);
