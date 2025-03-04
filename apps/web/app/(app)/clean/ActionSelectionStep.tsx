"use client";

import { useCallback } from "react";
import { useQueryState } from "nuqs";
import { TypographyH3 } from "@/components/Typography";
import { useStep } from "@/app/(app)/clean/useStep";
import type { EmailAction } from "@/app/(app)/clean/types";
import { ButtonListSurvey } from "@/components/ButtonListSurvey";

export function ActionSelectionStep() {
  const { onNext } = useStep();
  const [_, setAction] = useQueryState("action", { defaultValue: "archive" });

  const onSetAction = useCallback(
    (action: EmailAction) => {
      setAction(action);
      onNext();
    },
    [setAction, onNext],
  );

  return (
    <div className="text-center">
      <TypographyH3 className="mx-auto max-w-lg">
        Would you like cleaned emails to be archived or marked as read?
      </TypographyH3>

      <ButtonListSurvey
        className="mt-6"
        options={[
          {
            label: "Archive",
            value: "archive",
            recommended: true,
          },
          { label: "Mark as Read", value: "mark-read" },
        ]}
        onClick={(value) => onSetAction(value as EmailAction)}
      />
    </div>
  );
}
