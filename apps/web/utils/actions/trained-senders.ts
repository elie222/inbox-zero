"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  forgetTrainedSenderBody,
  moveTrainedSenderBody,
} from "@/utils/actions/trained-senders.validation";
import {
  forgetTrainedSender,
  moveTrainedSender,
} from "@/utils/group/move-trained-sender";

export const moveTrainedSenderAction = actionClient
  .metadata({ name: "moveTrainedSender" })
  .inputSchema(moveTrainedSenderBody)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { sender, ruleId },
    }) => {
      await moveTrainedSender({ emailAccountId, sender, ruleId, logger });
    },
  );

export const forgetTrainedSenderAction = actionClient
  .metadata({ name: "forgetTrainedSender" })
  .inputSchema(forgetTrainedSenderBody)
  .action(
    async ({ ctx: { emailAccountId, logger }, parsedInput: { sender } }) => {
      await forgetTrainedSender({ emailAccountId, sender, logger });
    },
  );
