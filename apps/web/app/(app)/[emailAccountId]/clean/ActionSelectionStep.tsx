"use client";

import { useCallback } from "react";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { TypographyH3 } from "@/components/Typography";
import { useStep } from "@/app/(app)/[emailAccountId]/clean/useStep";
import { ButtonListSurvey } from "@/components/ButtonListSurvey";
import { CleanAction } from "@prisma/client";

export function ActionSelectionStep() {
  const { onNext } = useStep();
  const [_, setAction] = useQueryState(
    "action",
    parseAsStringEnum([CleanAction.ARCHIVE, CleanAction.MARK_READ]),
  );

  const onSetAction = useCallback(
    (action: CleanAction) => {
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
            value: CleanAction.ARCHIVE,
          },
          { label: "Mark as Read", value: CleanAction.MARK_READ },
        ]}
        onClick={(value) => onSetAction(value as CleanAction)}
      />
    </div>
  );
}
