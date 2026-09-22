import { z } from "zod";

const id = z.string().min(1).max(200);
const mutationId = z.uuid();

export const shareConversationInput = z.object({
  memberId: id,
  source: z.object({ emailAccountId: id, providerConversationId: id }),
  participantMemberIds: z.array(id).min(1).max(20),
  clientMutationId: mutationId,
});

export const commentInput = z.object({
  memberId: id,
  conversationId: id,
  body: z.string().trim().min(1).max(10_000),
  mentionedMemberIds: z.array(id).max(20),
  clientMutationId: mutationId,
});

export const deleteCommentInput = z.object({
  memberId: id,
  conversationId: id,
  commentId: id,
  clientMutationId: mutationId,
});

export const participantAccessInput = z.object({
  memberId: id,
  conversationId: id,
  targetMemberId: id,
  access: z.boolean(),
  clientMutationId: mutationId,
});

export const stopSharingInput = z.object({
  memberId: id,
  conversationId: id,
  clientMutationId: mutationId,
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
