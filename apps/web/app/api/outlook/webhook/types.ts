import { z } from "zod";
import type { Client } from "@microsoft/microsoft-graph-client";
import type { RuleWithActionsAndCategories } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailAccount } from "@prisma/client";

const resourceDataSchema = z
  .object({
    "@odata.type": z.string().optional(),
    "@odata.id": z.string().optional(),
    id: z.string(),
    folderId: z.string().optional(),
    conversationId: z.string().optional(),
  })
  .passthrough(); // Allow additional properties

const notificationSchema = z.object({
  subscriptionId: z.string(),
  changeType: z.string(),
  resource: z.string().optional(),
  resourceData: resourceDataSchema,
  subscriptionExpirationDateTime: z.string().optional(),
  clientState: z.string().optional(),
  tenantId: z.string().optional(),
});

export const webhookBodySchema = z.object({
  value: z.array(notificationSchema),
  clientState: z.string().optional(),
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
  folderId?: string;
  conversationId?: string;
};
