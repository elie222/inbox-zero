"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { isThunderbirdProvider } from "@/utils/email/provider-types";
import {
  clearThunderbirdInbox,
  enqueueProposedActions,
  getThunderbirdInboxItem,
  updateThunderbirdInboxItem,
} from "@/utils/redis/thunderbird-inbox";
import {
  thunderbirdActionSchema,
  type ThunderbirdBridgeAction,
} from "@/utils/redis/thunderbird-actions";

const decideBody = z.object({
  itemId: z.string().min(1),
  decision: z.enum(["approve", "reject", "delete"]),
  proposedActions: z.array(thunderbirdActionSchema).optional(),
});

export const decideThunderbirdReviewAction = actionClient
  .metadata({ name: "decideThunderbirdReview" })
  .inputSchema(decideBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { itemId, decision, proposedActions },
    }) => {
      if (!isThunderbirdProvider(provider)) {
        throw new SafeError("Not a Thunderbird account");
      }

      const item = await getThunderbirdInboxItem(emailAccountId, itemId);
      if (!item) throw new SafeError("Review item not found");
      if (item.status !== "pending") {
        throw new SafeError(`Item already ${item.status}`);
      }

      if (decision === "reject") {
        const updated = await updateThunderbirdInboxItem(
          emailAccountId,
          itemId,
          { status: "rejected" },
        );
        return { ok: true, item: updated };
      }

      if (decision === "delete") {
        const trashAction: ThunderbirdBridgeAction = {
          type: "trash",
          id: randomUUID(),
          messageId: item.messageId,
          threadId: item.threadId,
          thunderbirdMessageId: item.thunderbirdMessageId,
          thunderbirdAccountId: item.thunderbirdAccountId,
        };
        await enqueueProposedActions(emailAccountId, [trashAction]);
        const updated = await updateThunderbirdInboxItem(
          emailAccountId,
          itemId,
          {
            status: "approved",
            proposedActions: [trashAction],
            reason: item.reason
              ? `${item.reason} · User chose Delete`
              : "User chose Delete",
          },
        );
        logger.info("Queued Thunderbird trash from review UI", { itemId });
        return { ok: true, item: updated, queued: 1 };
      }

      const actions = proposedActions?.length
        ? proposedActions
        : item.proposedActions;

      if (actions.length > 0) {
        await enqueueProposedActions(emailAccountId, actions);
      }

      const updated = await updateThunderbirdInboxItem(
        emailAccountId,
        itemId,
        {
          status: "approved",
          proposedActions: actions,
        },
      );

      logger.info("Approved Thunderbird review item", {
        itemId,
        actionCount: actions.length,
      });

      return { ok: true, item: updated, queued: actions.length };
    },
  );

export const clearThunderbirdReviewAction = actionClient
  .metadata({ name: "clearThunderbirdReview" })
  .inputSchema(z.object({}))
  .action(async ({ ctx: { emailAccountId, provider } }) => {
    if (!isThunderbirdProvider(provider)) {
      throw new SafeError("Not a Thunderbird account");
    }
    const cleared = await clearThunderbirdInbox(emailAccountId);
    return { ok: true, cleared };
  });
