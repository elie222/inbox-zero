"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { moveTrainedSenderBody } from "@/utils/actions/trained-senders.validation";
import { moveTrainedSender } from "@/utils/group/move-trained-sender";

export const moveTrainedSenderAction = actionClient
  .metadata({ name: "moveTrainedSender" })
  .inputSchema(moveTrainedSenderBody)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { itemId, ruleId },
    }) => {
      await moveTrainedSender({ emailAccountId, itemId, ruleId, logger });
    },
  );
