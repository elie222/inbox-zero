"use client";

import { useCallback } from "react";
import { parseAsInteger, useQueryState } from "nuqs";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { TypographyH3 } from "@/components/Typography";
import { useStep } from "@/app/(app)/[emailAccountId]/clean/useStep";
import { ButtonListSurvey } from "@/components/ButtonListSurvey";

export function TimeRangeStep() {
  const { i18n } = useLingui();
  const { onNext } = useStep();

  const [_, setTimeRange] = useQueryState("timeRange", parseAsInteger);

  const handleTimeRangeSelect = useCallback(
    (selectedRange: string | number) => {
      const range = Number(selectedRange);
      setTimeRange(range);
      onNext();
    },
    [setTimeRange, onNext],
  );

  return (
    <div className="text-center">
      <TypographyH3>
        <Trans>Which emails would you like to process?</Trans>
      </TypographyH3>

      <ButtonListSurvey
        className="mt-6"
        options={timeRangeOptions.map((option) => ({
          ...option,
          label: i18n._(option.label),
        }))}
        onClick={handleTimeRangeSelect}
      />
    </div>
  );
}

const timeRangeOptions = [
  { value: "0", label: msg`All emails` },
  { value: "1", label: msg`Older than 1 day` },
  { value: "3", label: msg`Older than 3 days` },
  { value: "7", label: msg`Older than 1 week`, recommended: true },
  { value: "14", label: msg`Older than 2 weeks` },
  { value: "30", label: msg`Older than 1 month` },
  { value: "90", label: msg`Older than 3 months` },
  { value: "365", label: msg`Older than 1 year` },
];
