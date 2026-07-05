import { z } from "zod";

export const saveOnboardingAnswersBody = z.object({
  surveyId: z.string().optional(),
  questions: z.any(),
  answers: z.any(),
});

export const saveOnboardingChatAnswersBody = z.object({
  answers: z.array(
    z.object({
      key: z.string().max(100),
      question: z.string().max(500),
      answer: z.string().trim().min(1).max(2000),
      isFreeform: z.boolean(),
    }),
  ),
});
export type SaveOnboardingChatAnswersBody = z.infer<
  typeof saveOnboardingChatAnswersBody
>;

export const stepWhoSchema = z.object({
  role: z.string().min(1, "Please select your role."),
});

export type StepWhoSchema = z.infer<typeof stepWhoSchema>;

export const saveOnboardingFeaturesSchema = z.object({
  features: z.array(z.string()),
});

export type SaveOnboardingFeaturesSchema = z.infer<
  typeof saveOnboardingFeaturesSchema
>;
