import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { createScopedLogger } from "@/utils/logger";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn().mockResolvedValue({
    getThread: vi
      .fn()
      .mockResolvedValue({ messages: [{ id: "provider-message" }] }),
  }),
}));
vi.mock("@/utils/team-comments/events", () => ({
  publishConversationChange: vi.fn(),
}));

const RUN_DB_TESTS = process.env.RUN_DB_TESTS;

describe.skipIf(!RUN_DB_TESTS)(
  "shared conversations (real database)",
  { timeout: 30_000 },
  () => {
    let prisma: typeof import("@/utils/prisma").default;
    let postComment: typeof import("@/utils/team-comments/comments").postComment;
    let deleteComment: typeof import("@/utils/team-comments/comments").deleteComment;
    let getComments: typeof import("@/utils/team-comments/comments").getComments;
    let getAuthorizedConversation: typeof import("@/utils/team-comments/access").getAuthorizedConversation;
    let stopSharing: typeof import("@/utils/team-comments/conversations").stopSharing;
    let shareConversation: typeof import("@/utils/team-comments/conversations").shareConversation;
    let setParticipantAccess: typeof import("@/utils/team-comments/conversations").setParticipantAccess;
    let ids: Awaited<ReturnType<typeof seed>>;
    const logger = createScopedLogger("shared-conversation-db-test");

    beforeAll(async () => {
      prisma = (await import("@/utils/prisma")).default;
      ({ postComment, getComments, deleteComment } = await import(
        "@/utils/team-comments/comments"
      ));
      ({ getAuthorizedConversation } = await import(
        "@/utils/team-comments/access"
      ));
      ({ stopSharing, shareConversation, setParticipantAccess } = await import(
        "@/utils/team-comments/conversations"
      ));
    });

    beforeEach(async () => {
      await cleanup(prisma);
      ids = await seed(prisma);
    });

    afterAll(async () => {
      await cleanup(prisma);
      await prisma.$disconnect();
    });

    test("teammate without mailbox access can read, while an admin without a grant cannot", async () => {
      const shared = await getAuthorizedConversation(
        { userId: ids.bUserId, memberId: ids.bMemberId },
        ids.conversationId,
      );
      expect(shared.conversation.publisherEmailAccountId).toBe(ids.aAccountId);
      await expect(
        getAuthorizedConversation(
          { userId: ids.cUserId, memberId: ids.cMemberId },
          ids.conversationId,
        ),
      ).rejects.toThrow("Conversation access unavailable");
      await expect(
        getAuthorizedConversation(
          { userId: ids.bUserId, memberId: ids.aMemberId },
          ids.conversationId,
        ),
      ).rejects.toThrow("Conversation access unavailable");
    });

    test("a lost response retried with the same ID commits one comment and one activity", async () => {
      const input = {
        conversationId: ids.conversationId,
        body: "Internal note",
        mentionedMemberIds: [ids.aMemberId],
        clientMutationId: "same-post",
        logger,
      };
      const first = await postComment(
        { userId: ids.bUserId, memberId: ids.bMemberId },
        input,
      );
      const retry = await postComment(
        { userId: ids.bUserId, memberId: ids.bMemberId },
        input,
      );
      expect(retry.id).toBe(first.id);
      expect(
        await prisma.conversationComment.count({
          where: { conversationId: ids.conversationId },
        }),
      ).toBe(1);
      expect(
        await prisma.conversationActivity.count({
          where: { commentId: first.id },
        }),
      ).toBe(1);
      await expect(
        postComment(
          { userId: ids.bUserId, memberId: ids.bMemberId },
          { ...input, body: "Different" },
        ),
      ).rejects.toThrow("Mutation ID was reused");
    });

    test("concurrent retries of one mutation commit one comment and one activity", async () => {
      const actor = { userId: ids.bUserId, memberId: ids.bMemberId };
      const input = {
        conversationId: ids.conversationId,
        body: "One concurrent note",
        mentionedMemberIds: [ids.aMemberId],
        clientMutationId: "concurrent-post",
        logger,
      };
      const comments = await Promise.all(
        Array.from({ length: 5 }, () => postComment(actor, input)),
      );
      expect(new Set(comments.map((comment) => comment.id)).size).toBe(1);
      expect(
        await prisma.conversationComment.count({
          where: { conversationId: ids.conversationId },
        }),
      ).toBe(1);
      expect(
        await prisma.conversationActivity.count({
          where: { commentId: comments[0].id },
        }),
      ).toBe(1);
    });

    test("concurrent retries of one share create one conversation and invitation", async () => {
      const actor = { userId: ids.aUserId, memberId: ids.aMemberId };
      const input = {
        source: {
          emailAccountId: ids.aAccountId,
          providerConversationId: "new-provider-thread",
        },
        participantMemberIds: [ids.cMemberId],
        clientMutationId: "concurrent-share",
        logger,
      };
      const results = await Promise.all(
        Array.from({ length: 3 }, () => shareConversation(actor, input)),
      );
      expect(new Set(results.map((result) => result.id)).size).toBe(1);
      expect(
        await prisma.sharedConversation.count({
          where: { providerConversationId: "new-provider-thread" },
        }),
      ).toBe(1);
      expect(
        await prisma.conversationActivity.count({
          where: { conversationId: results[0].id, kind: "INVITED" },
        }),
      ).toBe(1);
    });

    test("different concurrent mutations keep a consistent revision", async () => {
      const publisher = { userId: ids.aUserId, memberId: ids.aMemberId };
      const teammate = { userId: ids.bUserId, memberId: ids.bMemberId };
      const [comment] = await Promise.all([
        postComment(teammate, {
          conversationId: ids.conversationId,
          body: "Concurrent note",
          mentionedMemberIds: [],
          clientMutationId: "concurrent-note",
          logger,
        }),
        setParticipantAccess(publisher, {
          conversationId: ids.conversationId,
          memberId: ids.cMemberId,
          access: true,
          clientMutationId: "concurrent-invite",
          logger,
        }),
      ]);
      await Promise.all([
        deleteComment(teammate, {
          conversationId: ids.conversationId,
          commentId: comment.id,
          clientMutationId: "concurrent-delete",
          logger,
        }),
        setParticipantAccess(publisher, {
          conversationId: ids.conversationId,
          memberId: ids.cMemberId,
          access: false,
          clientMutationId: "concurrent-revoke",
          logger,
        }),
      ]);
      const conversation = await prisma.sharedConversation.findUniqueOrThrow({
        where: { id: ids.conversationId },
      });
      expect(conversation.revision).toBe(4);
      expect(
        await prisma.conversationComment.findUniqueOrThrow({
          where: { id: comment.id },
        }),
      ).toMatchObject({ deletedAt: expect.any(Date) });
      expect(
        await prisma.conversationActivity.count({
          where: { conversationId: ids.conversationId, kind: "INVITED" },
        }),
      ).toBe(1);
    });

    test("a post racing participant revocation cannot leave an active grant", async () => {
      const publisher = { userId: ids.aUserId, memberId: ids.aMemberId };
      const teammate = { userId: ids.bUserId, memberId: ids.bMemberId };
      const [postResult, revokeResult] = await Promise.allSettled([
        postComment(teammate, {
          conversationId: ids.conversationId,
          body: "Racing note",
          mentionedMemberIds: [],
          clientMutationId: "racing-note",
          logger,
        }),
        setParticipantAccess(publisher, {
          conversationId: ids.conversationId,
          memberId: ids.bMemberId,
          access: false,
          clientMutationId: "racing-revocation",
          logger,
        }),
      ]);
      expect(revokeResult.status).toBe("fulfilled");
      await expect(
        getAuthorizedConversation(teammate, ids.conversationId),
      ).rejects.toThrow("Conversation access unavailable");
      const commentCount = await prisma.conversationComment.count({
        where: { conversationId: ids.conversationId },
      });
      expect(commentCount).toBe(postResult.status === "fulfilled" ? 1 : 0);
      expect(
        await prisma.conversationMutationReceipt.count({
          where: { conversationId: ids.conversationId, resultKind: "comment" },
        }),
      ).toBe(commentCount);
    });

    test("the first comment page contains the newest entries and older pages do not repeat them", async () => {
      await prisma.conversationComment.createMany({
        data: Array.from({ length: 105 }, (_, index) => ({
          conversationId: ids.conversationId,
          authorUserId: ids.aUserId,
          authorMemberId: ids.aMemberId,
          authorIdentityId: ids.aMemberId,
          body: `Comment ${index + 1}`,
          revision: index + 1,
          generation: 1,
        })),
      });
      await prisma.sharedConversation.update({
        where: { id: ids.conversationId },
        data: { revision: 105 },
      });
      const actor = { userId: ids.bUserId, memberId: ids.bMemberId };
      const latest = await getComments(actor, {
        conversationId: ids.conversationId,
        limit: 100,
      });
      expect(latest.comments[0].body).toBe("Comment 6");
      expect(latest.comments.at(-1)?.body).toBe("Comment 105");
      const older = await getComments(actor, {
        conversationId: ids.conversationId,
        beforeRevision: latest.nextCursor!,
        limit: 100,
      });
      expect(older.comments.map((comment) => comment.body)).toEqual([
        "Comment 1",
        "Comment 2",
        "Comment 3",
        "Comment 4",
        "Comment 5",
      ]);
    });

    test("membership removal preserves comments but a rejoined identity has no grant", async () => {
      await postComment(
        { userId: ids.bUserId, memberId: ids.bMemberId },
        {
          conversationId: ids.conversationId,
          body: "Keep the discussion",
          mentionedMemberIds: [],
          clientMutationId: "post-before-removal",
          logger,
        },
      );
      await prisma.member.delete({ where: { id: ids.bMemberId } });
      const newMember = await prisma.member.create({
        data: {
          organizationId: ids.organizationId,
          emailAccountId: ids.bAccountId,
        },
      });
      await expect(
        getAuthorizedConversation(
          { userId: ids.bUserId, memberId: newMember.id },
          ids.conversationId,
        ),
      ).rejects.toThrow("Conversation access unavailable");
      const comment = await prisma.conversationComment.findFirstOrThrow({
        where: { conversationId: ids.conversationId },
      });
      expect(comment.body).toBe("Keep the discussion");
      expect(comment.authorMemberId).toBeNull();
    });

    test("removing and re-adding a current teammate restores only that membership's grant", async () => {
      const actor = { userId: ids.aUserId, memberId: ids.aMemberId };
      await setParticipantAccess(actor, {
        conversationId: ids.conversationId,
        memberId: ids.bMemberId,
        access: false,
        clientMutationId: "remove-b",
        logger,
      });
      await expect(
        getAuthorizedConversation(
          { userId: ids.bUserId, memberId: ids.bMemberId },
          ids.conversationId,
        ),
      ).rejects.toThrow("Conversation access unavailable");
      await setParticipantAccess(actor, {
        conversationId: ids.conversationId,
        memberId: ids.bMemberId,
        access: true,
        clientMutationId: "restore-b",
        logger,
      });
      await expect(
        getAuthorizedConversation(
          { userId: ids.bUserId, memberId: ids.bMemberId },
          ids.conversationId,
        ),
      ).resolves.toBeTruthy();
      expect(
        await prisma.conversationParticipant.count({
          where: {
            conversationId: ids.conversationId,
            memberIdentityId: ids.bMemberId,
            generation: 1,
          },
        }),
      ).toBe(1);
      expect(
        await prisma.conversationActivity.count({
          where: {
            conversationId: ids.conversationId,
            participant: { memberIdentityId: ids.bMemberId },
            kind: "INVITED",
          },
        }),
      ).toBe(1);
    });

    test("stopping and restarting creates a new generation without restoring an unselected teammate", async () => {
      const stopped = await stopSharing(
        { userId: ids.aUserId, memberId: ids.aMemberId },
        ids.conversationId,
        "stop-one",
        logger,
      );
      expect(stopped).toEqual({ stopped: true });
      expect(
        await stopSharing(
          { userId: ids.aUserId, memberId: ids.aMemberId },
          ids.conversationId,
          "stop-one",
          logger,
        ),
      ).toEqual({ stopped: true });
      await expect(
        getAuthorizedConversation(
          { userId: ids.bUserId, memberId: ids.bMemberId },
          ids.conversationId,
        ),
      ).rejects.toThrow("Conversation access unavailable");
      const restarted = await shareConversation(
        { userId: ids.aUserId, memberId: ids.aMemberId },
        {
          source: {
            emailAccountId: ids.aAccountId,
            providerConversationId: "provider-thread",
          },
          participantMemberIds: [ids.cMemberId],
          clientMutationId: "restart-one",
          logger,
        },
      );
      expect(restarted.generation).toBe(2);
      await expect(
        getAuthorizedConversation(
          { userId: ids.bUserId, memberId: ids.bMemberId },
          ids.conversationId,
        ),
      ).rejects.toThrow("Conversation access unavailable");
      await expect(
        getAuthorizedConversation(
          { userId: ids.cUserId, memberId: ids.cMemberId },
          ids.conversationId,
        ),
      ).resolves.toBeTruthy();
      await expect(
        stopSharing(
          { userId: ids.aUserId, memberId: ids.aMemberId },
          ids.conversationId,
          "stop-one",
          logger,
        ),
      ).rejects.toThrow("Sharing has changed");
    });
  },
);

async function seed(prisma: typeof import("@/utils/prisma").default) {
  const prefix = "team-comments-db-test";
  const [a, b, c] = await Promise.all(
    ["a", "b", "c"].map(async (name) => {
      const email = `${prefix}-${name}@example.com`;
      const user = await prisma.user.create({ data: { email } });
      const account = await prisma.account.create({
        data: {
          userId: user.id,
          provider: "google",
          providerAccountId: email,
          type: "oauth",
        },
      });
      const mailbox = await prisma.emailAccount.create({
        data: {
          userId: user.id,
          accountId: account.id,
          email,
        },
      });
      return { user, mailbox };
    }),
  );
  const organization = await prisma.organization.create({
    data: {
      name: "Team comments DB test",
      slug: "team-comments-db-test",
    },
  });
  const [aMember, bMember, cMember] = await Promise.all([
    prisma.member.create({
      data: {
        organizationId: organization.id,
        emailAccountId: a.mailbox.id,
        role: "owner",
      },
    }),
    prisma.member.create({
      data: { organizationId: organization.id, emailAccountId: b.mailbox.id },
    }),
    prisma.member.create({
      data: {
        organizationId: organization.id,
        emailAccountId: c.mailbox.id,
        role: "admin",
      },
    }),
  ]);
  const conversation = await prisma.sharedConversation.create({
    data: {
      organizationId: organization.id,
      publisherEmailAccountId: a.mailbox.id,
      publisherAccountIdentityId: a.mailbox.id,
      publisherMemberId: aMember.id,
      providerConversationId: "provider-thread",
      participants: {
        create: [
          { memberId: aMember.id, memberIdentityId: aMember.id, generation: 1 },
          { memberId: bMember.id, memberIdentityId: bMember.id, generation: 1 },
        ],
      },
    },
  });
  return {
    organizationId: organization.id,
    conversationId: conversation.id,
    aUserId: a.user.id,
    aAccountId: a.mailbox.id,
    aMemberId: aMember.id,
    bUserId: b.user.id,
    bAccountId: b.mailbox.id,
    bMemberId: bMember.id,
    cUserId: c.user.id,
    cMemberId: cMember.id,
  };
}

async function cleanup(prisma: typeof import("@/utils/prisma").default) {
  await prisma.organization.deleteMany({
    where: { slug: "team-comments-db-test" },
  });
  await prisma.user.deleteMany({
    where: { email: { startsWith: "team-comments-db-test-" } },
  });
}
