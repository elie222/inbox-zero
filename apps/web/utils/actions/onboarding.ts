"use server";

import {
  saveOnboardingAnswersBody,
  saveOnboardingFeaturesSchema,
} from "@/utils/actions/onboarding.validation";
import { actionClientUser } from "@/utils/actions/safe-action";
import prisma from "@/utils/prisma";

export const completedOnboardingAction = actionClientUser
  .metadata({ name: "completedOnboarding" })
  .action(async ({ ctx: { userId } }) => {
    await prisma.user.update({
      where: { id: userId, completedOnboardingAt: null },
      data: { completedOnboardingAt: new Date() },
    });
  });

// export const completedAppOnboardingAction = actionClientUser
//   .metadata({ name: "completedAppOnboarding" })
//   .action(async ({ ctx: { userId } }) => {
//     await prisma.user.update({
//       where: { id: userId, completedAppOnboardingAt: null },
//       data: { completedAppOnboardingAt: new Date() },
//     });
//   });

export const saveOnboardingAnswersAction = actionClientUser
  .metadata({ name: "saveOnboardingAnswers" })
  .schema(saveOnboardingAnswersBody)
  .action(
    async ({
      parsedInput: { surveyId, questions, answers },
      ctx: { userId },
    }) => {
      // Helper function to extract survey answers from the response format
      function extractSurveyAnswers(questions: any[], answers: any) {
        const result: {
          surveyFeatures?: string[];
          surveyRole?: string;
          surveyGoal?: string;
          surveySource?: string;
          surveyImprovements?: string;
        } = {};

        if (!questions || !answers) return result;

        // Helper to get answer by question key
        const getAnswerByKey = (key: string) => {
          const questionIndex = questions.findIndex((q) => q.key === key);
          if (questionIndex === -1) return null;

          const answerKey =
            questionIndex === 0
              ? "$survey_response"
              : `$survey_response_${questionIndex}`;
          const answer = answers[answerKey];

          return answer && answer !== "" ? answer : null;
        };

        // Extract features (multiple choice)
        const featuresAnswer = getAnswerByKey("features");
        if (featuresAnswer) {
          if (typeof featuresAnswer === "string") {
            const features = featuresAnswer
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
              .filter((s) => s !== "undefined");
            if (features.length > 0) {
              result.surveyFeatures = features;
            }
          } else if (Array.isArray(featuresAnswer)) {
            const features = featuresAnswer.filter(
              (f) => f && f !== "undefined",
            );
            if (features.length > 0) {
              result.surveyFeatures = features;
            }
          }
        }

        // Extract other single choice/text answers - only set if not undefined/null/empty
        const roleAnswer = getAnswerByKey("role");
        if (roleAnswer && roleAnswer !== "undefined") {
          result.surveyRole = roleAnswer;
        }

        const goalAnswer = getAnswerByKey("goal");
        if (goalAnswer && goalAnswer !== "undefined") {
          result.surveyGoal = goalAnswer;
        }

        const sourceAnswer = getAnswerByKey("source");
        if (sourceAnswer && sourceAnswer !== "undefined") {
          result.surveySource = sourceAnswer;
        }

        const improvementsAnswer = getAnswerByKey("improvements");
        if (improvementsAnswer && improvementsAnswer !== "undefined") {
          result.surveyImprovements = improvementsAnswer;
        }

        return result;
      }

      // Extract individual survey answers for easier querying
      const extractedAnswers = extractSurveyAnswers(questions, answers);

      await prisma.user.update({
        where: { id: userId },
        data: {
          onboardingAnswers: { surveyId, questions, answers },
          surveyFeatures: extractedAnswers.surveyFeatures,
          surveyRole: extractedAnswers.surveyRole,
          surveyGoal: extractedAnswers.surveyGoal,
          surveySource: extractedAnswers.surveySource,
          surveyImprovements: extractedAnswers.surveyImprovements,
        },
      });
    },
  );

export const saveOnboardingFeaturesAction = actionClientUser
  .metadata({ name: "saveOnboardingFeatures" })
  .schema(saveOnboardingFeaturesSchema)
  .action(async ({ ctx: { userId }, parsedInput: { features } }) => {
    await prisma.user.update({
      where: { id: userId },
      data: {
        surveyFeatures: features,
      },
    });
  });
