"use client";

import { useCallback } from "react";
import { useQueryState } from "nuqs";
import { ArchiveIcon, MailIcon } from "lucide-react";
import { TypographyH3 } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { useStep } from "@/app/(app)/clean/useStep";
import type { EmailAction } from "@/app/(app)/clean/types";

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

      <div className="mt-6 flex flex-col gap-3">
        <Button
          variant="outline"
          onClick={() => onSetAction("archive")}
          Icon={ArchiveIcon}
        >
          Archive (Recommended)
        </Button>
        <Button
          variant="outline"
          onClick={() => onSetAction("mark-read")}
          Icon={MailIcon}
        >
          Mark as Read
        </Button>
      </div>
    </div>
  );
}
