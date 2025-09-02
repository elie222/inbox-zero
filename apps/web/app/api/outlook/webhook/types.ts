import { z } from "zod";
import type { Client } from "@microsoft/microsoft-graph-client";
import type { RuleWithActionsAndCategories } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailAccount } from "@prisma/client";

const resourceDataSchema = z
  .object({
    "@odata.type": z.string().nullish(),
    "@odata.id": z.string().nullish(),
    id: z.string(),
    folderId: z.string().nullish(),
    conversationId: z.string().nullish(),
  })
  .passthrough(); // Allow additional properties

const notificationSchema = z.object({
  subscriptionId: z.string(),
  changeType: z.string(),
  resource: z.string().nullish(),
  resourceData: resourceDataSchema,
  subscriptionExpirationDateTime: z.string().nullish(),
  clientState: z.string().nullish(),
  tenantId: z.string().nullish(),
});

export const webhookBodySchema = z.object({
  value: z.array(notificationSchema),
});

export type ProcessHistoryOptions = {
  client: Client;
  accessToken: string;
  rules: RuleWithActionsAndCategories[];
  hasAutomationRules: boolean;
  hasAiAccess: boolean;
  emailAccount: Pick<
    EmailAccount,
    "coldEmailPrompt" | "coldEmailBlocker" | "autoCategorizeSenders"
  > &
    EmailAccountWithAI;
};

export type OutlookResourceData = {
  id: string;
  folderId?: string | null;
  conversationId?: string | null;
};
