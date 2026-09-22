import { beforeEach, describe, expect, test, vi } from "vitest";
import { createEmailProvider } from "@/utils/email/provider";
import { createScopedLogger } from "@/utils/logger";
import { getAuthorizedConversation } from "@/utils/team-comments/access";
import {
  getSharedAttachment,
  getSharedMessages,
} from "@/utils/team-comments/content";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/email/provider", () => ({ createEmailProvider: vi.fn() }));
vi.mock("@/utils/team-comments/access", () => ({
  getAuthorizedConversation: vi.fn(),
}));

const actor = { userId: "user", memberId: "member" };
const logger = createScopedLogger("shared-content-test");
const getThread = vi.fn();
const getAttachmentStream = vi.fn();

describe("shared conversation content safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthorizedConversation).mockResolvedValue({
      conversation: {
        generation: 1,
        publisherEmailAccountId: "account",
        publisherEmailAccount: {
          account: { provider: "google", disconnectedAt: null },
        },
        providerConversationId: "thread",
      },
    } as Awaited<ReturnType<typeof getAuthorizedConversation>>);
    vi.mocked(createEmailProvider).mockResolvedValue({
      getThread,
      getAttachmentStream,
    } as Awaited<ReturnType<typeof createEmailProvider>>);
    getThread.mockResolvedValue({
      messages: [
        {
          id: "visible",
          threadId: "thread",
          labelIds: ["INBOX"],
          headers: {
            from: "sender@example.com",
            to: "recipient@example.com",
            bcc: "private@example.com",
            subject: "Shared subject",
          },
          date: "2026-09-22T12:00:00Z",
          textPlain: "Visible message",
          textHtml:
            '<script>alert("bad")</script><form><input value="bad"></form><p style="background-image:url(https://tracker.example/background)">Visible message</p><img src="https://tracker.example/pixel" srcset="https://tracker.example/large 2x"><img src="cid:allowed"><img src="cid:unknown">',
          attachments: [
            {
              attachmentId: "file",
              filename: "safe.txt",
              mimeType: "text/plain",
              size: 4,
            },
          ],
          inline: [
            {
              attachmentId: "inline",
              filename: "inline.png",
              mimeType: "image/png",
              size: 4,
              headers: { "content-id": "<allowed>" },
            },
          ],
        },
        { id: "draft", threadId: "thread", labelIds: ["DRAFT"] },
        { id: "unrelated", threadId: "other", labelIds: ["INBOX"] },
      ],
    });
    getAttachmentStream.mockResolvedValue(new ReadableStream());
  });

  test("projects only sent or received mail and strips unsafe HTML and private metadata", async () => {
    const result = await getSharedMessages(actor, "share", logger);
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0];
    expect(message.text).toBe("Visible message");
    expect(JSON.stringify(result)).not.toContain("private@example.com");
    expect(JSON.stringify(result)).not.toContain("tracker.example");
    expect(message.html).not.toMatch(/<script|<form|<input/i);
    expect(message.html).not.toContain("cid:unknown");
    expect(message.html).toContain(
      "/api/team-comments/conversations/share/attachments/0:1?memberId=member",
    );
    expect(message.attachments.map((attachment) => attachment.ref)).toEqual([
      "0:0",
      "0:1",
    ]);
  });

  test("attachment references cannot select a draft or another conversation", async () => {
    await expect(
      getSharedAttachment(actor, {
        conversationId: "share",
        attachmentRef: "0:0",
        logger,
      }),
    ).resolves.toMatchObject({ filename: "safe.txt" });
    await expect(
      getSharedAttachment(actor, {
        conversationId: "share",
        attachmentRef: "1:0",
        logger,
      }),
    ).resolves.toBeNull();
    expect(getAttachmentStream).toHaveBeenCalledTimes(1);
  });
});
