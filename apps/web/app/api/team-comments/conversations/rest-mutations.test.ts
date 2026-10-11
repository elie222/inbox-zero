import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as share } from "./route";
import { DELETE as stop } from "./[conversationId]/route";
import { POST as post } from "./[conversationId]/comments/route";
import { DELETE as remove } from "./[conversationId]/comments/[commentId]/route";
import { POST as access } from "./[conversationId]/participants/route";
import { POST as read } from "./[conversationId]/read/route";
import { POST as mute } from "./[conversationId]/mute/route";

const authMock = vi.hoisted(() => vi.fn());
const conversations = vi.hoisted(() => ({
  getShareForSource: vi.fn(),
  getSharedConversation: vi.fn(),
  listSharedConversations: vi.fn(),
  setParticipantAccess: vi.fn(),
  shareConversation: vi.fn(),
  stopSharing: vi.fn(),
}));
const comments = vi.hoisted(() => ({
  deleteComment: vi.fn(),
  getComments: vi.fn(),
  postComment: vi.fn(),
}));
const activity = vi.hoisted(() => ({
  markConversationRead: vi.fn(),
  setConversationMuted: vi.fn(),
}));

vi.mock("@/utils/auth", () => ({ auth: authMock }));
vi.mock("@/utils/prisma");
vi.mock("@/utils/team-comments/conversations", () => conversations);
vi.mock("@/utils/team-comments/comments", () => comments);
vi.mock("@/utils/team-comments/activity", () => activity);

const actor = { userId: "user-1", memberId: "member-1" };
const clientMutationId = "8f14e45f-ceea-467f-a0e6-1c0c2a1e7b11";

describe("team comment REST mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("shares a thread for the signed-in user's member", async () => {
    conversations.shareConversation.mockResolvedValue({ id: "conversation-1" });
    const response = await share(
      jsonRequest("POST", "/api/team-comments/conversations", {
        memberId: "member-1",
        source: { emailAccountId: "account-1", threadId: "thread-1" },
        participantMemberIds: ["member-2"],
      }),
      context({}),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: "conversation-1" });
    expect(conversations.shareConversation).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        source: { emailAccountId: "account-1", threadId: "thread-1" },
        participantMemberIds: ["member-2"],
      }),
    );
  });

  it("posts a comment to the conversation in the path", async () => {
    comments.postComment.mockResolvedValue({ id: "comment-1" });
    const response = await post(
      jsonRequest("POST", "/api/team-comments/conversations/c-1/comments", {
        memberId: "member-1",
        conversationId: "ignored",
        body: "Looks good @Sam",
        mentionedMemberIds: ["member-2"],
        clientMutationId,
      }),
      context({ conversationId: "c-1" }),
    );
    expect(response.status).toBe(200);
    expect(comments.postComment).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        conversationId: "c-1",
        body: "Looks good @Sam",
        mentionedMemberIds: ["member-2"],
        clientMutationId,
      }),
    );
  });

  it("rejects an empty comment before it reaches the store", async () => {
    const response = await post(
      jsonRequest("POST", "/api/team-comments/conversations/c-1/comments", {
        memberId: "member-1",
        body: "   ",
        mentionedMemberIds: [],
        clientMutationId,
      }),
      context({ conversationId: "c-1" }),
    );
    expect(response.status).toBe(400);
    expect(comments.postComment).not.toHaveBeenCalled();
  });

  it("deletes a comment and stops sharing with the member from the query", async () => {
    comments.deleteComment.mockResolvedValue({
      id: "comment-1",
      deleted: true,
    });
    conversations.stopSharing.mockResolvedValue({ stopped: true });
    const deleted = await remove(
      new NextRequest(
        "http://localhost/api/team-comments/conversations/c-1/comments/comment-1?memberId=member-1",
        { method: "DELETE" },
      ),
      context({ conversationId: "c-1", commentId: "comment-1" }),
    );
    const stopped = await stop(
      new NextRequest(
        "http://localhost/api/team-comments/conversations/c-1?memberId=member-1",
        { method: "DELETE" },
      ),
      context({ conversationId: "c-1" }),
    );
    expect(deleted.status).toBe(200);
    expect(stopped.status).toBe(200);
    expect(comments.deleteComment).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        conversationId: "c-1",
        commentId: "comment-1",
      }),
    );
    expect(conversations.stopSharing).toHaveBeenCalledWith(
      actor,
      "c-1",
      expect.anything(),
    );
  });

  it("requires a member ID to delete", async () => {
    const response = await remove(
      new NextRequest(
        "http://localhost/api/team-comments/conversations/c-1/comments/comment-1",
        { method: "DELETE" },
      ),
      context({ conversationId: "c-1", commentId: "comment-1" }),
    );
    expect(response.status).toBe(400);
    expect(comments.deleteComment).not.toHaveBeenCalled();
  });

  it("changes participant access, read position, and mute", async () => {
    conversations.setParticipantAccess.mockResolvedValue({ id: "c-1" });
    activity.markConversationRead.mockResolvedValue({ readRevision: 4 });
    activity.setConversationMuted.mockResolvedValue({ muted: true });
    const base = "/api/team-comments/conversations/c-1";
    const params = context({ conversationId: "c-1" });
    expect(
      (
        await access(
          jsonRequest("POST", `${base}/participants`, {
            memberId: "member-1",
            targetMemberId: "member-2",
            access: false,
          }),
          params,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await read(
          jsonRequest("POST", `${base}/read`, {
            memberId: "member-1",
            throughRevision: 4,
          }),
          params,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await mute(
          jsonRequest("POST", `${base}/mute`, {
            memberId: "member-1",
            muted: true,
          }),
          params,
        )
      ).status,
    ).toBe(200);
    expect(conversations.setParticipantAccess).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        conversationId: "c-1",
        memberId: "member-2",
        access: false,
      }),
    );
    expect(activity.markConversationRead).toHaveBeenCalledWith(actor, {
      conversationId: "c-1",
      throughRevision: 4,
    });
    expect(activity.setConversationMuted).toHaveBeenCalledWith(actor, {
      conversationId: "c-1",
      muted: true,
    });
  });

  it("rejects mutations without a session", async () => {
    authMock.mockResolvedValue(null);
    const response = await mute(
      jsonRequest("POST", "/api/team-comments/conversations/c-1/mute", {
        memberId: "member-1",
        muted: true,
      }),
      context({ conversationId: "c-1" }),
    );
    expect(response.status).toBe(401);
    expect(activity.setConversationMuted).not.toHaveBeenCalled();
  });
});

function jsonRequest(method: string, path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function context<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}
