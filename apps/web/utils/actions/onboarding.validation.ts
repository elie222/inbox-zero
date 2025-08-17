import { z } from "zod";

export const saveOnboardingAnswersBody = z.object({
  surveyId: z.string().optional(),
  questions: z.any(),
  answers: z.any(),
});

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
