import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleApprove,
  handleReject,
  handleEdit,
  handleEditSubmit,
} from "./actions";

// Mock external dependencies
vi.mock("./poster", () => ({
  updateSlackMessage: vi.fn().mockResolvedValue(undefined),
}));

const mockViewsOpenGlobal = vi.fn().mockResolvedValue({ ok: true });

vi.mock("@slack/web-api", () => {
  const WebClient = vi.fn(function (this: any) {
    this.views = { open: mockViewsOpenGlobal };
  });
  return { WebClient };
});

vi.mock("@/utils/gmail/draft", () => ({
  sendDraft: vi
    .fn()
    .mockResolvedValue({ messageId: "msg123", threadId: "thread123" }),
  deleteDraft: vi.fn().mockResolvedValue(undefined),
}));

import { updateSlackMessage } from "./poster";
import { sendDraft, deleteDraft } from "@/utils/gmail/draft";

const mockDraft = {
  id: "draft-record-id",
  slackMessageTs: "1234567890.123456",
  slackChannelId: "C123456",
  gmailDraftId: "r-12345678901234567",
  gmailThreadId: "thread-abc",
  emailAccountId: "email-account-id",
  toAddress: "client@example.com",
  subject: "Re: Session next week",
  bodyHtml: "<p>Hi there! Let's schedule that session.</p>",
  status: "pending",
  category: "scheduling",
  claudeResponse: {},
  processedEmailId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockEmailAccount = {
  id: "email-account-id",
  email: "me@example.com",
};

function makePrisma(
  overrides: {
    cosPendingDraftFindUnique?: any;
    emailAccountFindUnique?: any;
    cosPendingDraftUpdate?: any;
    nullDraft?: boolean;
  } = {},
) {
  return {
    cosPendingDraft: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          overrides.nullDraft
            ? null
            : (overrides.cosPendingDraftFindUnique ?? mockDraft),
        ),
      update: vi.fn().mockResolvedValue(
        overrides.cosPendingDraftUpdate ?? {
          ...mockDraft,
          status: "approved",
        },
      ),
    },
    emailAccount: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          overrides.emailAccountFindUnique ?? mockEmailAccount,
        ),
    },
  };
}

function makeGmailClient() {
  return {
    users: {
      drafts: {
        send: vi
          .fn()
          .mockResolvedValue({ data: { id: "msg123", threadId: "thread123" } }),
        delete: vi.fn().mockResolvedValue({ status: 204 }),
        create: vi.fn().mockResolvedValue({
          data: { id: "r-new-draft-id", message: { id: "newmsg" } },
        }),
      },
    },
  };
}

describe("handleApprove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends the Gmail draft", async () => {
    const prisma = makePrisma();
    const gmailClient = makeGmailClient();
    const getGmailClient = vi.fn().mockResolvedValue(gmailClient);

    await handleApprove({
      slackMessageTs: mockDraft.slackMessageTs,
      channelId: "C123456",
      slackAccessToken: "xoxb-token",
      prisma,
      getGmailClient,
    });

    expect(sendDraft).toHaveBeenCalledWith(gmailClient, mockDraft.gmailDraftId);
  });

  it("updates the draft status to approved", async () => {
    const prisma = makePrisma();
    const gmailClient = makeGmailClient();
    const getGmailClient = vi.fn().mockResolvedValue(gmailClient);

    await handleApprove({
      slackMessageTs: mockDraft.slackMessageTs,
      channelId: "C123456",
      slackAccessToken: "xoxb-token",
      prisma,
      getGmailClient,
    });

    expect(prisma.cosPendingDraft.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slackMessageTs: mockDraft.slackMessageTs },
        data: expect.objectContaining({ status: "approved" }),
      }),
    );
  });

  it("updates the Slack message to show Sent", async () => {
    const prisma = makePrisma();
    const gmailClient = makeGmailClient();
    const getGmailClient = vi.fn().mockResolvedValue(gmailClient);

    await handleApprove({
      slackMessageTs: mockDraft.slackMessageTs,
      channelId: "C123456",
      slackAccessToken: "xoxb-token",
      prisma,
      getGmailClient,
    });

    expect(updateSlackMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "xoxb-token",
        channelId: "C123456",
        messageTs: mockDraft.slackMessageTs,
        text: expect.stringMatching(/sent/i),
      }),
    );
  });

  it("throws if draft not found", async () => {
    const prisma = makePrisma({ nullDraft: true });
    const getGmailClient = vi.fn();

    await expect(
      handleApprove({
        slackMessageTs: "nonexistent-ts",
        channelId: "C123456",
        slackAccessToken: "xoxb-token",
        prisma,
        getGmailClient,
      }),
    ).rejects.toThrow();
  });
});

describe("handleReject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the Gmail draft", async () => {
    const prisma = makePrisma();
    const gmailClient = makeGmailClient();
    const getGmailClient = vi.fn().mockResolvedValue(gmailClient);

    await handleReject({
      slackMessageTs: mockDraft.slackMessageTs,
      channelId: "C123456",
      slackAccessToken: "xoxb-token",
      prisma,
      getGmailClient,
    });

    expect(deleteDraft).toHaveBeenCalledWith(
      gmailClient,
      mockDraft.gmailDraftId,
    );
  });

  it("updates the draft status to rejected", async () => {
    const prisma = makePrisma();
    const gmailClient = makeGmailClient();
    const getGmailClient = vi.fn().mockResolvedValue(gmailClient);

    await handleReject({
      slackMessageTs: mockDraft.slackMessageTs,
      channelId: "C123456",
      slackAccessToken: "xoxb-token",
      prisma,
      getGmailClient,
    });

    expect(prisma.cosPendingDraft.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slackMessageTs: mockDraft.slackMessageTs },
        data: expect.objectContaining({ status: "rejected" }),
      }),
    );
  });

  it("updates the Slack message to show Skipped", async () => {
    const prisma = makePrisma();
    const gmailClient = makeGmailClient();
    const getGmailClient = vi.fn().mockResolvedValue(gmailClient);

    await handleReject({
      slackMessageTs: mockDraft.slackMessageTs,
      channelId: "C123456",
      slackAccessToken: "xoxb-token",
      prisma,
      getGmailClient,
    });

    expect(updateSlackMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "xoxb-token",
        channelId: "C123456",
        messageTs: mockDraft.slackMessageTs,
        text: expect.stringMatching(/skipped/i),
      }),
    );
  });
});

describe("handleEdit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens a Slack modal with the draft body", async () => {
    const prisma = makePrisma();
    mockViewsOpenGlobal.mockClear();

    await handleEdit({
      slackMessageTs: mockDraft.slackMessageTs,
      triggerId: "trigger-123",
      slackAccessToken: "xoxb-token",
      prisma,
    });

    expect(mockViewsOpenGlobal).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger_id: "trigger-123",
        view: expect.objectContaining({
          callback_id: "cos_edit_modal",
          private_metadata: mockDraft.slackMessageTs,
        }),
      }),
    );
  });

  it("throws if draft not found", async () => {
    const prisma = makePrisma({ nullDraft: true });

    await expect(
      handleEdit({
        slackMessageTs: "nonexistent-ts",
        triggerId: "trigger-123",
        slackAccessToken: "xoxb-token",
        prisma,
      }),
    ).rejects.toThrow();
  });
});

describe("handleEditSubmit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the old draft and sends a new one", async () => {
    const prisma = makePrisma();
    const gmailClient = makeGmailClient();
    const getGmailClient = vi.fn().mockResolvedValue(gmailClient);

    await handleEditSubmit({
      slackMessageTs: mockDraft.slackMessageTs,
      newBody: "Updated body text",
      channelId: "C123456",
      slackAccessToken: "xoxb-token",
      prisma,
      getGmailClient,
    });

    expect(deleteDraft).toHaveBeenCalledWith(
      gmailClient,
      mockDraft.gmailDraftId,
    );
    expect(sendDraft).toHaveBeenCalled();
  });

  it("updates the draft status to edited", async () => {
    const prisma = makePrisma();
    const gmailClient = makeGmailClient();
    const getGmailClient = vi.fn().mockResolvedValue(gmailClient);

    await handleEditSubmit({
      slackMessageTs: mockDraft.slackMessageTs,
      newBody: "Updated body text",
      channelId: "C123456",
      slackAccessToken: "xoxb-token",
      prisma,
      getGmailClient,
    });

    expect(prisma.cosPendingDraft.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slackMessageTs: mockDraft.slackMessageTs },
        data: expect.objectContaining({ status: "edited" }),
      }),
    );
  });

  it("updates the Slack message after edit submit", async () => {
    const prisma = makePrisma();
    const gmailClient = makeGmailClient();
    const getGmailClient = vi.fn().mockResolvedValue(gmailClient);

    await handleEditSubmit({
      slackMessageTs: mockDraft.slackMessageTs,
      newBody: "Updated body text",
      channelId: "C123456",
      slackAccessToken: "xoxb-token",
      prisma,
      getGmailClient,
    });

    expect(updateSlackMessage).toHaveBeenCalled();
  });
});
