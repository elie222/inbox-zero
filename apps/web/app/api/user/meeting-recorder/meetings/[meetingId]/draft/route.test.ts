import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const { createEmailProviderMock, emailProvider, getEmailAccountMock } =
  vi.hoisted(() => {
    const emailProvider = { getDraft: vi.fn() };

    return {
      createEmailProviderMock: vi.fn().mockResolvedValue(emailProvider),
      emailProvider,
      getEmailAccountMock: vi.fn(),
    };
  });

vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: (...args: unknown[]) => createEmailProviderMock(...args),
}));
vi.mock("@/utils/redis/account-validation", () => ({
  getEmailAccount: (...args: unknown[]) => getEmailAccountMock(...args),
}));
vi.mock("@/utils/middleware", async () => {
  const { createWithAuthTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithAuthTestMiddleware({
    auth: { userId: "user-1" },
  });
});

import { GET } from "./route";

const requestUrl =
  "http://localhost:3000/api/user/meeting-recorder/meetings/meeting-1/draft?emailAccountId=email-account-1";
const routeContext = { params: Promise.resolve({ meetingId: "meeting-1" }) };

describe("meeting follow-up draft route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEmailAccountMock.mockResolvedValue("user@gmail.com");
  });

  it("opens the related Gmail draft's conversation in Drafts", async () => {
    prisma.meeting.findFirst.mockResolvedValue({
      followUpDraftId: "draft-resource-123",
      emailAccount: { account: { provider: "google" } },
    } as never);
    emailProvider.getDraft.mockResolvedValue({
      id: "draft-message-123",
      threadId: "thread-123",
    });

    const response = await GET(new NextRequest(requestUrl), routeContext);

    expect(prisma.meeting.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "meeting-1", emailAccountId: "email-account-1" },
      }),
    );
    expect(emailProvider.getDraft).toHaveBeenCalledWith("draft-resource-123");
    expect(response.headers.get("location")).toBe(
      "https://mail.google.com/mail/u/?authuser=user%40gmail.com#drafts/thread-123",
    );
  });

  // The draft is fetched fresh rather than linked from the stored id, both
  // because editing a draft replaces its message id and because only the live
  // Graph response carries the deeplink Outlook can actually resolve.
  it("opens the related draft within the full Outlook client", async () => {
    getEmailAccountMock.mockResolvedValue("user@example.com");
    prisma.meeting.findFirst.mockResolvedValue({
      followUpDraftId: "draft-resource-123",
      emailAccount: { account: { provider: "microsoft" } },
    } as never);
    emailProvider.getDraft.mockResolvedValue({
      id: "draft-message-123",
      threadId: "thread-123",
      externalUrl:
        "https://outlook.live.com/mail/0/deeplink/read/AAMkAG-owa_id%3D",
    });

    const response = await GET(new NextRequest(requestUrl), routeContext);

    expect(emailProvider.getDraft).toHaveBeenCalledWith("draft-resource-123");
    expect(response.headers.get("location")).toBe(
      "https://outlook.live.com/mail/0/deeplink/read/AAMkAG-owa_id%3D?ispopout=0",
    );
  });

  it("returns an explicit error when the draft cannot be linked to", async () => {
    getEmailAccountMock.mockResolvedValue("user@example.com");
    prisma.meeting.findFirst.mockResolvedValue({
      followUpDraftId: "draft-resource-123",
      emailAccount: { account: { provider: "microsoft" } },
    } as never);
    emailProvider.getDraft.mockResolvedValue({
      id: "",
      threadId: "thread-123",
    });

    const response = await GET(new NextRequest(requestUrl), routeContext);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "The draft exists, but it cannot be opened in your mailbox.",
    });
    expect(response.headers.get("location")).toBeNull();
  });

  it("rejects email accounts the user does not own", async () => {
    getEmailAccountMock.mockResolvedValue(null);

    const response = await GET(new NextRequest(requestUrl), routeContext);

    expect(getEmailAccountMock).toHaveBeenCalledWith({
      userId: "user-1",
      emailAccountId: "email-account-1",
    });
    expect(response.status).toBe(403);
    expect(prisma.meeting.findFirst).not.toHaveBeenCalled();
  });

  it("returns not found when the meeting has no related draft", async () => {
    prisma.meeting.findFirst.mockResolvedValue(null);

    const response = await GET(new NextRequest(requestUrl), routeContext);

    expect(response.status).toBe(404);
    expect(createEmailProviderMock).not.toHaveBeenCalled();
    expect(emailProvider.getDraft).not.toHaveBeenCalled();
  });
});
