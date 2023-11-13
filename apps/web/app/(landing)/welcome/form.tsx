"use client";

import { useCallback } from "react";
import clsx from "clsx";
import { SubmitHandler, useForm } from "react-hook-form";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { survey } from "@/app/(landing)/welcome/survey";
import { Button, ButtonLoader } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { env } from "@/env.mjs";
import { completedOnboarding } from "@/utils/actions";

const surveyId = env.NEXT_PUBLIC_POSTHOG_ONBOARDING_SURVEY_ID;

type Inputs = Record<"$survey_response" | `$survey_response_${number}`, string>;

export const OnboardingForm = (props: { questionIndex: number }) => {
  const { questionIndex } = props;

  const posthog = usePostHog();
  const router = useRouter();
  const searchParams = useSearchParams();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Inputs>();

  const name =
    questionIndex === 0
      ? `$survey_response`
      : (`$survey_response_${questionIndex}` as const);

  const submitPosthog = useCallback(
    (seachParams: URLSearchParams) => {
      const responses = survey.questions.reduce((acc, _q, i) => {
        const name =
          i === 0 ? `$survey_response` : (`$survey_response_${i}` as const);
        return { ...acc, [name]: seachParams.get(name) };
      }, {});

      const posthogData = {
        ...responses,
        $survey_id: surveyId,
      };

      posthog.capture("survey sent", posthogData);
    },
    [posthog]
  );

  const onSubmit: SubmitHandler<Inputs> = useCallback(
    async (data) => {
      const newSeachParams = new URLSearchParams(searchParams);
      newSeachParams.set("question", (questionIndex + 1).toString());
      newSeachParams.set(name, data[name]);

      // submit on last question
      if (questionIndex === survey.questions.length - 1) {
        submitPosthog(newSeachParams);

        await completedOnboarding();

        router.push(`/stats`);
      } else {
        router.push(`/welcome?${newSeachParams}`);
      }
    },
    [name, questionIndex, router, searchParams, submitPosthog]
  );

  const question = survey.questions[questionIndex];

  return (
    <div className="grid gap-8 md:grid-cols-5">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="order-last flex items-center md:order-first md:col-span-2"
      >
        <div>
          <div className="my-4 text-lg font-semibold">{question.question}</div>
          {question.choices && (
            <div className="grid gap-2">
              {question.choices?.map((answer) => (
                <Button
                  key={answer}
                  variant="outline"
                  type="button"
                  onClick={(e) => {
                    setValue(name, answer);
                    handleSubmit(onSubmit)(e);
                  }}
                >
                  {answer}
                </Button>
              ))}
            </div>
          )}
          {question.type === "open" && (
            <div>
              <Input
                type="text"
                as="textarea"
                rows={3}
                name={name}
                registerProps={register(name)}
                error={errors[name]}
              />
              <Button className="mt-4 w-full" type="submit">
                {isSubmitting && <ButtonLoader />}
                Submit
              </Button>
            </div>
          )}
          <Button
            variant="ghost"
            className="mt-8"
            onClick={() => {
              submitPosthog(searchParams);
              posthog.capture("survey dismissed", { $survey_id: surveyId });
            }}
          >
            Skip Onboarding
          </Button>
        </div>
      </form>
      <div className="flex items-center justify-center md:col-span-3">
        <Image
          src={question.image}
          alt="Product screenshot"
          className={clsx(
            "order-first max-h-64 w-full rounded bg-white md:order-last md:max-h-96",
            question.zoomImage !== false &&
              "transform shadow-2xl duration-300 hover:scale-150 md:hover:scale-[200%]"
          )}
          width={1200}
          height={900}
        />
      </div>
    </div>
  );
};
