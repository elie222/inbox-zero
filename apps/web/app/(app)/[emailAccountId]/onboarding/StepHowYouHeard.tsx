"use client";

import {
  ArrowRightIcon,
  Megaphone,
  Users,
  Search,
  Sparkles,
  MoreHorizontal,
} from "lucide-react";
import {
  FacebookIcon,
  GithubIcon,
  LinkedinIcon,
  RedditIcon,
  TwitterIcon,
  YoutubeIcon,
} from "@/app/(app)/[emailAccountId]/onboarding/BrandIcons";
import { useAction } from "next-safe-action/hooks";
import { useCallback, useState } from "react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { OnboardingButton } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingButton";
import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";
import { saveOnboardingAnswersAction } from "@/utils/actions/onboarding";
import { toastError } from "@/components/Toast";
import { captureException, getActionErrorMessage } from "@/utils/error";

const OTHER_VALUE = "other";

const SOURCES = [
  {
    value: "search",
    label: "Search",
    icon: <Search className="size-4" />,
  },
  {
    value: "llm",
    label: "ChatGPT, Claude, or other AI",
    icon: <Sparkles className="size-4" />,
  },
  {
    value: "friend",
    label: "Friend or colleague",
    icon: <Users className="size-4" />,
  },
  {
    value: "youtube",
    label: "YouTube",
    icon: <YoutubeIcon className="size-4" />,
  },
  {
    value: "twitter",
    label: "Twitter / X",
    icon: <TwitterIcon className="size-4" />,
  },
  {
    value: "linkedin",
    label: "LinkedIn",
    icon: <LinkedinIcon className="size-4" />,
  },
  {
    value: "reddit",
    label: "Reddit",
    icon: <RedditIcon className="size-4" />,
  },
  {
    value: "facebook",
    label: "Facebook",
    icon: <FacebookIcon className="size-4" />,
  },
  {
    value: "github",
    label: "GitHub",
    icon: <GithubIcon className="size-4" />,
  },
  {
    value: OTHER_VALUE,
    label: "Other",
    icon: <MoreHorizontal className="size-4" />,
  },
];

export function StepHowYouHeard({ onNext }: { onNext: () => void }) {
  const { executeAsync: saveSource } = useAction(saveOnboardingAnswersAction);
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [customSource, setCustomSource] = useState("");

  const submitSource = useCallback(
    (source: string) => {
      onNext();

      saveSource({
        surveyId: "onboarding",
        questions: [{ key: "source", type: "single_choice" }],
        answers: { $survey_response: source },
      })
        .then((result) => {
          if (result?.serverError || result?.validationErrors) {
            captureException(new Error("Failed to save onboarding source"), {
              extra: {
                context: "onboarding",
                step: "source",
                serverError: result?.serverError,
                validationErrors: result?.validationErrors,
              },
            });
            toastError({
              description: getActionErrorMessage(
                {
                  serverError: result?.serverError,
                  validationErrors: result?.validationErrors,
                },
                {
                  prefix:
                    "We couldn't save that answer, but you can keep going",
                },
              ),
            });
          }
        })
        .catch((error) => {
          captureException(error, {
            extra: { context: "onboarding", step: "source" },
          });
          toastError({
            description:
              "We couldn't save that answer, but you can keep going.",
          });
        });
    },
    [onNext, saveSource],
  );

  const onSelectSource = useCallback(
    (value: string) => {
      if (value === OTHER_VALUE) {
        setShowOtherInput(true);
        return;
      }
      submitSource(value);
    },
    [submitSource],
  );

  return (
    <OnboardingWrapper className="py-0">
      <IconCircle size="lg" className="mx-auto">
        <Megaphone className="size-6" />
      </IconCircle>

      <div className="text-center mt-4">
        <PageHeading>How did you hear about Inbox Zero?</PageHeading>
        <TypographyP className="mt-2 max-w-lg mx-auto">
          We'd love to know how you found us.
        </TypographyP>
      </div>

      <div className="mt-6 grid gap-3">
        {SOURCES.map((source) => (
          <OnboardingButton
            key={source.value}
            text={source.label}
            icon={source.icon}
            onClick={() => onSelectSource(source.value)}
          />
        ))}
      </div>

      {showOtherInput && (
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submitSource(`other: ${customSource.trim()}`);
          }}
        >
          <Input
            name="customSource"
            type="text"
            placeholder="Where did you hear about us?"
            registerProps={{
              value: customSource,
              onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                setCustomSource(event.target.value),
              autoFocus: true,
            }}
          />
          <div className="flex w-full max-w-xs mx-auto">
            <Button
              type="submit"
              className="w-full"
              disabled={!customSource.trim()}
            >
              Continue
              <ArrowRightIcon className="size-4 ml-2" />
            </Button>
          </div>
        </form>
      )}
    </OnboardingWrapper>
  );
}
