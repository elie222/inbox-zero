"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  moveTrainedSenderBody,
  trainedSenderBody,
} from "@/utils/actions/trained-senders.validation";
import {
  forgetTrainedSender,
  keepSenderInInbox,
  moveTrainedSender,
  trainSenderToDelete,
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
  .inputSchema(trainedSenderBody)
  .action(
    async ({ ctx: { emailAccountId, logger }, parsedInput: { sender } }) => {
      await forgetTrainedSender({ emailAccountId, sender, logger });
    },
  );

export const keepSenderInInboxAction = actionClient
  .metadata({ name: "keepSenderInInbox" })
  .inputSchema(trainedSenderBody)
  .action(
    async ({ ctx: { emailAccountId, logger }, parsedInput: { sender } }) => {
      await keepSenderInInbox({ emailAccountId, sender, logger });
    },
  );

export const trainSenderToDeleteAction = actionClient
  .metadata({ name: "trainSenderToDelete" })
  .inputSchema(trainedSenderBody)
  .action(
    async ({ ctx: { emailAccountId, logger }, parsedInput: { sender } }) => {
      await trainSenderToDelete({ emailAccountId, sender, logger });
    },
  );
