"use client";

import { useCallback, useEffect, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import type { Properties } from "posthog-js";
import { survey } from "@/app/(landing)/welcome/survey";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { env } from "@/env";
import {
  completedOnboardingAction,
  saveOnboardingAnswersAction,
} from "@/utils/actions/onboarding";
import { useOnboardingAnalytics } from "@/hooks/useAnalytics";

const surveyId = env.NEXT_PUBLIC_POSTHOG_ONBOARDING_SURVEY_ID;

type Inputs = Record<"$survey_response" | `$survey_response_${number}`, string>;

export const OnboardingForm = (props: { questionIndex: number }) => {
  const { questionIndex } = props;

  const posthog = usePostHog();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showOtherInput, setShowOtherInput] = useState(false);

  const analytics = useOnboardingAnalytics("welcome");

  useEffect(() => {
    analytics.onStart();
  }, [analytics]);

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Inputs>();

  const name =
    questionIndex === 0
      ? "$survey_response"
      : (`$survey_response_${questionIndex}` as const);

  const isFinalQuestion = questionIndex === survey.questions.length - 1;

  const submitPosthog = useCallback(
    (responses: Properties) => {
      analytics.onComplete();
      posthog.capture("survey sent", { ...responses, $survey_id: surveyId });
    },
    [posthog, analytics],
  );

  const onSubmit: SubmitHandler<Inputs> = useCallback(
    async (data) => {
      const answer = data[name];

      // ask user to fill in other input
      if (answer === "Other") {
        setShowOtherInput(true);
        setValue(name, "");
        return;
      }
      setShowOtherInput(false);

      const newSeachParams = new URLSearchParams(searchParams);
      newSeachParams.set("question", (questionIndex + 1).toString());
      newSeachParams.set(name, answer);

      analytics.onNext(questionIndex + 1);

      const responses = getResponses(newSeachParams);
      await saveOnboardingAnswersAction({
        surveyId,
        questions: survey.questions,
        answers: responses,
      });

      // submit on last question
      if (isFinalQuestion) {
        submitPosthog(responses);
        await completedOnboardingAction();

        router.push("/welcome-upgrade");
      } else {
        router.push(`/welcome?${newSeachParams}`);
      }
    },
    [
      name,
      questionIndex,
      router,
      searchParams,
      submitPosthog,
      setValue,
      isFinalQuestion,
      analytics,
    ],
  );

  const question = survey.questions[questionIndex];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex justify-center">
      <div>
        <div className="my-4 text-lg">{question.question}</div>
        {question.choices && (
          <div className="grid gap-2">
            {question.choices?.map((answer) => (
              <Button
                key={answer}
                variant={
                  watch(name)?.includes(answer) ? "secondary" : "outline"
                }
                type="button"
                // quick and dirty radio button implementation
                onClick={(e) => {
                  if (question.type === "multiple_choice") {
                    const values = new Set(getValues(name)?.split(","));
                    if (values.has(answer)) {
                      values.delete(answer);
                    } else {
                      values.add(answer);
                    }

                    const newValue = Array.from(values).join(",");
                    setValue(name, newValue);
                  } else {
                    setValue(name, answer);
                    handleSubmit(onSubmit)(e);
                  }
                }}
              >
                {answer}
              </Button>
            ))}

            {showOtherInput && (
              <Input
                type="text"
                name={name}
                registerProps={register(name)}
                error={errors[name]}
              />
            )}
          </div>
        )}
        {question.type === "open" && (
          <div>
            <Input
              type="text"
              autosizeTextarea
              rows={3}
              name={name}
              registerProps={register(name)}
              error={errors[name]}
              placeholder="Optional"
            />
            <Button
              className="mt-4 w-full"
              type="submit"
              loading={isSubmitting}
            >
              Get Started
            </Button>
          </div>
        )}

        {(question.type === "multiple_choice" ||
          showOtherInput ||
          question.skippable) && (
          <Button className="mt-4 w-full" type="submit" loading={isSubmitting}>
            {question.skippable ? "Skip" : "Next"}
          </Button>
        )}

        {/* {!isFinalQuestion && (
          <SkipOnboardingButton
            searchParams={searchParams}
            submitPosthog={submitPosthog}
            posthog={posthog}
            router={router}
          />
        )} */}
      </div>
    </form>
  );
};

// function SkipOnboardingButton({
//   searchParams,
//   submitPosthog,
//   posthog,
//   router,
// }: {
//   searchParams: URLSearchParams;
//   submitPosthog: (responses: Properties) => void;
//   posthog: PostHog;
//   router: AppRouterInstance;
// }) {
//   // // A/B test whether to show skip onboarding button
//   // if (posthog.getFeatureFlag("show-skip-onboarding-button") === "hide")
//   //   return null;

//   return (
//     <Button
//       variant="ghost"
//       className="mt-8"
//       type="button"
//       onClick={async () => {
//         const responses = getResponses(searchParams);
//         submitPosthog(responses);
//         posthog.capture("survey dismissed", { $survey_id: surveyId });
//         await completedOnboardingAction();
//         router.push(env.NEXT_PUBLIC_APP_HOME_PATH);
//       }}
//     >
//       Skip Onboarding
//     </Button>
//   );
// }

function getResponses(seachParams: URLSearchParams): Record<string, string> {
  const responses = survey.questions.reduce(
    (acc, _q, i) => {
      const name =
        i === 0 ? "$survey_response" : (`$survey_response_${i}` as const);
      acc[name] = seachParams.get(name) ?? "";
      return acc;
    },
    {} as Record<string, string>,
  );

  return responses;
}
