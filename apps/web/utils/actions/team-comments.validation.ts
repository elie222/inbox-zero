import { z } from "zod";

const id = z.string().trim().min(1).max(200);
export const shareConversationInput = z.object({
  memberId: id,
  source: z.object({ emailAccountId: id, threadId: id }),
  participantMemberIds: z.array(id).min(1).max(20),
});

export const commentInput = z.object({
  memberId: id,
  conversationId: id,
  body: z.string().trim().min(1).max(10_000),
  mentionedMemberIds: z.array(id).max(20),
  clientMutationId: z.uuid(),
});

export const deleteCommentInput = z.object({
  memberId: id,
  conversationId: id,
  commentId: id,
});

export const participantAccessInput = z.object({
  memberId: id,
  conversationId: id,
  targetMemberId: id,
  access: z.boolean(),
});

export const stopSharingInput = z.object({
  memberId: id,
  conversationId: id,
});

export const readConversationInput = z.object({
  memberId: id,
  conversationId: id,
  throughRevision: z.number().int().min(0),
});

export const muteConversationInput = z.object({
  memberId: id,
  conversationId: id,
  muted: z.boolean(),
});

// REST bodies for the mobile app. The conversation and comment IDs come from
// the route path.
export const commentBody = commentInput.omit({ conversationId: true });
export const participantAccessBody = participantAccessInput.omit({
  conversationId: true,
});
export const readConversationBody = readConversationInput.omit({
  conversationId: true,
});
export const muteConversationBody = muteConversationInput.omit({
  conversationId: true,
});
