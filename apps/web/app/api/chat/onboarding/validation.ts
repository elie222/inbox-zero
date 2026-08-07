import { z } from "zod";

export const ONBOARDING_CHAT_MAX_TEXT_LENGTH = 2000;
export const MAX_SETUP_RULES = 15;

export const onboardingRuleActionSchema = z.enum([
  "label",
  "label_archive",
  "move_folder",
]);
export type OnboardingRuleAction = z.infer<typeof onboardingRuleActionSchema>;

// The draft setup the user and assistant are editing together. The client owns
// this state; it is sent along with every request so the model always sees the
// current version, including manual panel edits.
export const onboardingSetupSchema = z.object({
  rules: z
    .array(
      z.object({
        // SystemType for the standard categories, null for assistant-added rules
        key: z.string().nullable(),
        name: z.string().max(40),
        description: z.string().max(500),
        action: onboardingRuleActionSchema,
        enabled: z.boolean(),
        addedByAssistant: z.boolean(),
      }),
    )
    .max(MAX_SETUP_RULES),
  status: z.enum(["draft", "enabling", "live", "error"]),
});
export type OnboardingSetup = z.infer<typeof onboardingSetupSchema>;

export const onboardingScanSchema = z.object({
  status: z.enum(["pending", "ready", "unavailable"]),
  emailsPerDay: z.number().nullable(),
  emailsLastMonth: z.number().nullable(),
  cleanupSuggestions: z
    .array(
      z.object({
        name: z.string().max(200),
        emailCount: z.number(),
        readPercent: z.number(),
      }),
    )
    .max(10),
  totalCleanupSuggestions: z.number(),
});
export type OnboardingScan = z.infer<typeof onboardingScanSchema>;

const messagePartSchema = z
  .looseObject({ type: z.string() })
  .refine(
    (part) =>
      part.type !== "text" ||
      (typeof part.text === "string" &&
        part.text.length <= ONBOARDING_CHAT_MAX_TEXT_LENGTH),
    { message: "Message text too long" },
  );

export const ONBOARDING_CHAT_MAX_TOTAL_TEXT_LENGTH = 40_000;

export const onboardingChatInputSchema = z.object({
  messages: z
    .array(
      z.object({
        id: z.string(),
        // Only the server injects system messages; the client replays the
        // visible conversation
        role: z.enum(["user", "assistant"]),
        parts: z.array(messagePartSchema).max(20),
        metadata: z.looseObject({}).optional(),
      }),
    )
    .min(1)
    .max(80)
    .refine(
      (messages) =>
        messages.reduce(
          (total, message) =>
            total +
            message.parts.reduce(
              (sum, part) =>
                sum + (typeof part.text === "string" ? part.text.length : 0),
              0,
            ),
          0,
        ) <= ONBOARDING_CHAT_MAX_TOTAL_TEXT_LENGTH,
      { message: "Conversation too long" },
    ),
  setup: onboardingSetupSchema,
  scan: onboardingScanSchema,
  isPremium: z.boolean(),
});
export type OnboardingChatInput = z.infer<typeof onboardingChatInputSchema>;
