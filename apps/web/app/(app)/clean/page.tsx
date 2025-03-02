"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/utils";
import { useCallback, useEffect, useState } from "react";
import { parseAsInteger, useQueryState } from "nuqs";
import { CleanStep } from "./types";
import type { EmailAction } from "./types";
import { IntroStep } from "@/app/(app)/clean/IntroStep";
import { ActionSelectionStep } from "@/app/(app)/clean/ActionSelectionStep";
import { LabelOptionsStep } from "@/app/(app)/clean/LabelOptionsStep";
import { TimeRangeStep } from "@/app/(app)/clean/TimeRangeStep";
import { ConfirmationStep } from "@/app/(app)/clean/ConfirmationStep";
import { ProcessingStep } from "@/app/(app)/clean/ProcessingStep";

export default function Clean() {
  // TODO: can make these props instead and not a client component
  const [step, setStep] = useQueryState(
    "step",
    parseAsInteger.withDefault(CleanStep.INTRO),
  );
  const [action, setAction] = useQueryState("action", {
    defaultValue: "archive",
  });
  const [timeRange, setTimeRange] = useQueryState("timeRange", {
    defaultValue: "7",
  });
  const [labelInstructions, setLabelInstructions] = useQueryState(
    "labelInstructions",
    { defaultValue: "" },
  );

  // Local state for unread count (would be fetched from API in real implementation)
  const [unreadCount, setUnreadCount] = useState<number | null>(null);

  // Simulate fetching the unread count
  useEffect(() => {
    // This would be a real API call in production
    const fetchUnreadCount = () => {
      // Simulate API delay
      setTimeout(() => {
        setUnreadCount(57392);
      }, 500);
    };

    fetchUnreadCount();
  }, []);

  // Navigation handlers
  const handleNextStep = useCallback(() => {
    setStep((prev) => (prev !== null ? prev + 1 : CleanStep.INTRO));
  }, [setStep]);

  const handleReset = useCallback(() => {
    setStep(CleanStep.INTRO);
  }, [setStep]);

  const handleActionSelect = useCallback(
    (selectedAction: EmailAction) => {
      setAction(selectedAction);
      handleNextStep();
    },
    [setAction, handleNextStep],
  );

  const handleLabelSubmit = useCallback(
    (instructions: string) => {
      setLabelInstructions(instructions);
      handleNextStep();
    },
    [setLabelInstructions, handleNextStep],
  );

  const handleTimeRangeSelect = useCallback(
    (selectedRange: string) => {
      setTimeRange(selectedRange);
      handleNextStep();
    },
    [setTimeRange, handleNextStep],
  );

  // Calculate estimated time
  const calculateEstimatedTime = useCallback(() => {
    if (!unreadCount) return "calculating...";

    const secondsPerEmail = 1;
    const totalSeconds = unreadCount * secondsPerEmail;

    if (totalSeconds < 60) {
      return `${totalSeconds} seconds`;
    } else if (totalSeconds < 3600) {
      return `${Math.ceil(totalSeconds / 60)} minutes`;
    } else {
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.ceil((totalSeconds % 3600) / 60);
      return `${hours} hour${hours > 1 ? "s" : ""} and ${minutes} minute${minutes > 1 ? "s" : ""}`;
    }
  }, [unreadCount]);

  // Render different content based on the current step
  const renderStepContent = () => {
    switch (step) {
      case CleanStep.INTRO:
        return <IntroStep unreadCount={unreadCount} onNext={handleNextStep} />;

      case CleanStep.ARCHIVE_OR_READ:
        return <ActionSelectionStep onActionSelect={handleActionSelect} />;

      case CleanStep.LABEL_OPTIONS:
        return <LabelOptionsStep onSubmit={handleLabelSubmit} />;

      case CleanStep.TIME_RANGE:
        return (
          <TimeRangeStep
            timeRange={timeRange}
            onTimeRangeSelect={handleTimeRangeSelect}
          />
        );

      case CleanStep.FINAL_CONFIRMATION:
        return (
          <ConfirmationStep
            estimatedTime={calculateEstimatedTime()}
            onStart={handleNextStep}
          />
        );

      case CleanStep.PROCESSING:
        return (
          <ProcessingStep
            action={action as EmailAction}
            timeRangeInDays={Number.parseInt(timeRange, 10)}
            labelInstructions={labelInstructions}
            onReset={handleReset}
          />
        );

      default:
        return (
          <div className="text-center">
            <h3 className="text-xl font-semibold">Something went wrong</h3>
            <button
              type="button"
              className="mt-4 rounded bg-blue-500 px-4 py-2 text-white"
              onClick={() => setStep(CleanStep.INTRO)}
            >
              Start Over
            </button>
          </div>
        );
    }
  };

  return (
    <div>
      <Card className={cn("mx-4 mt-10 max-w-2xl p-6 md:mx-auto")}>
        {renderStepContent()}
      </Card>
    </div>
  );
}
