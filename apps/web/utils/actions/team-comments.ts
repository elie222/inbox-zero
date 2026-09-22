"use server";

import { actionClientUser } from "@/utils/actions/safe-action";
import {
  commentInput,
  deleteCommentInput,
  muteConversationInput,
  participantAccessInput,
  readConversationInput,
  shareConversationInput,
  stopSharingInput,
} from "@/utils/actions/team-comments.validation";
import {
  markConversationRead,
  setConversationMuted,
} from "@/utils/team-comments/activity";
import { deleteComment, postComment } from "@/utils/team-comments/comments";
import {
  setParticipantAccess,
  shareConversation,
  stopSharing,
} from "@/utils/team-comments/conversations";

export const shareConversationAction = actionClientUser
  .metadata({ name: "shareConversation" })
  .inputSchema(shareConversationInput)
  .action(async ({ ctx: { userId, logger }, parsedInput }) =>
    shareConversation(
      { userId, memberId: parsedInput.memberId },
      { ...parsedInput, logger },
    ),
  );

export const postCommentAction = actionClientUser
  .metadata({ name: "postConversationComment" })
  .inputSchema(commentInput)
  .action(async ({ ctx: { userId, logger }, parsedInput }) =>
    postComment(
      { userId, memberId: parsedInput.memberId },
      { ...parsedInput, logger },
    ),
  );

export const deleteCommentAction = actionClientUser
  .metadata({ name: "deleteConversationComment" })
  .inputSchema(deleteCommentInput)
  .action(async ({ ctx: { userId, logger }, parsedInput }) =>
    deleteComment(
      { userId, memberId: parsedInput.memberId },
      { ...parsedInput, logger },
    ),
  );

export const setParticipantAccessAction = actionClientUser
  .metadata({ name: "setConversationParticipantAccess" })
  .inputSchema(participantAccessInput)
  .action(async ({ ctx: { userId, logger }, parsedInput }) =>
    setParticipantAccess(
      { userId, memberId: parsedInput.memberId },
      {
        conversationId: parsedInput.conversationId,
        memberId: parsedInput.targetMemberId,
        access: parsedInput.access,
        clientMutationId: parsedInput.clientMutationId,
        logger,
      },
    ),
  );

export const stopSharingAction = actionClientUser
  .metadata({ name: "stopConversationSharing" })
  .inputSchema(stopSharingInput)
  .action(async ({ ctx: { userId, logger }, parsedInput }) =>
    stopSharing(
      { userId, memberId: parsedInput.memberId },
      parsedInput.conversationId,
      parsedInput.clientMutationId,
      logger,
    ),
  );

export const markConversationReadAction = actionClientUser
  .metadata({ name: "markConversationRead" })
  .inputSchema(readConversationInput)
  .action(async ({ ctx: { userId }, parsedInput }) =>
    markConversationRead(
      { userId, memberId: parsedInput.memberId },
      parsedInput,
    ),
  );

export const setConversationMutedAction = actionClientUser
  .metadata({ name: "setConversationMuted" })
  .inputSchema(muteConversationInput)
  .action(async ({ ctx: { userId }, parsedInput }) =>
    setConversationMuted(
      { userId, memberId: parsedInput.memberId },
      parsedInput,
    ),
  );
