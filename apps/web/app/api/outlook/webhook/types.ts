import { z } from "zod";
import type { Client } from "@microsoft/microsoft-graph-client";
import type { RuleWithActionsAndCategories } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailAccount } from "@prisma/client";

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

const resourceDataSchema = z
  .object({
    "@odata.type": z.string().nullable(),
    "@odata.id": z.string().nullable(),
    id: z.string(),
    folderId: z.string().nullable(),
    conversationId: z.string().nullable(),
  })
  .passthrough(); // Allow additional properties

const notificationSchema = z.object({
  subscriptionId: z.string(),
  changeType: z.string(),
  resource: z.string().nullable(),
  resourceData: resourceDataSchema,
  subscriptionExpirationDateTime: z.string().nullable(),
  clientState: z.string().nullable(),
  tenantId: z.string().nullable(),
});

export const webhookBodySchema = z.object({
  value: z.array(notificationSchema),
  clientState: z.string().nullable(),
});

export type OutlookResourceData = z.infer<typeof resourceDataSchema>;
