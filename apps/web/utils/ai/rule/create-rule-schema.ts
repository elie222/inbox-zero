import { z } from "zod";
import { GroupName } from "@/utils/config";
import { ActionType } from "@prisma/client";

export const createRuleSchema = z.object({
  name: z.string().describe("The name of the rule"),
  // `requiresAI` helps prevent the subject line being set too narrowly
  requiresAI: z
    .enum(["yes", "no"])
    .describe(
      "Yes, if an AI is required, and it cannot be handled by static conditions or groups. For example, labelling marketing emails requires an AI to read the content. Receipts and Newsletters can be handled by preset groups so they do not require AI. Emails from a domain can be handled by static conditions, so they do not require AI.",
    ),
  actions: z
    .array(
      z.object({
        type: z.nativeEnum(ActionType).describe("The type of the action"),
        label: z
          .string()
          .nullish()
          .transform((v) => v ?? null)
          .describe("The label to apply to the email"),
        to: z
          .string()
          .nullish()
          .transform((v) => v ?? null)
          .describe("The to email address to send the email to"),
        cc: z
          .string()
          .nullish()
          .transform((v) => v ?? null)
          .describe("The cc email address to send the email to"),
        bcc: z
          .string()
          .nullish()
          .transform((v) => v ?? null)
          .describe("The bcc email address to send the email to"),
        subject: z
          .string()
          .nullish()
          .transform((v) => v ?? null)
          .describe("The subject of the email"),
        content: z
          .string()
          .nullish()
          .transform((v) => v ?? null)
          .describe("The content of the email"),
      }),
    )
    .describe("The actions to take"),
  staticConditions: z
    .object({
      from: z.string().optional().describe("The from email address to match"),
      to: z.string().optional().describe("The to email address to match"),
      subject: z
        .string()
        .optional()
        .describe(
          "The subject to match. Leave blank if AI is required to process the subject line.",
        ),
    })
    .optional()
    .describe("The static conditions to match"),
  group: z
    .enum([GroupName.RECEIPT, GroupName.NEWSLETTER])
    .optional()
    .describe("The group to match"),
});
