import { z } from "zod";
import type { RuleWithActionsAndCategories } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailAccount } from "@prisma/client";
import type { EmailProvider } from "@/utils/email/types";

export type ProcessHistoryOptions = {
  provider: EmailProvider;
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

export type OutlookResourceData = z.infer<typeof resourceDataSchema>;
