"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastError, toastSuccess } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useAction } from "next-safe-action/hooks";
import { updateMeetingBriefsMinutesBeforeAction } from "@/utils/actions/meeting-briefs";
import { LoadingMiniSpinner } from "@/components/Loading";
import {
  updateMeetingBriefsMinutesBeforeBody,
  type UpdateMeetingBriefsMinutesBeforeBody,
} from "@/utils/actions/meeting-briefs.validation";

type Unit = "minutes" | "hours";

function minutesToValueAndUnit(totalMinutes: number): {
  value: number;
  unit: Unit;
} {
  if (totalMinutes >= 60 && totalMinutes % 60 === 0) {
    return { value: totalMinutes / 60, unit: "hours" };
  }
  return { value: totalMinutes, unit: "minutes" };
}

function valueAndUnitToMinutes(value: number, unit: Unit): number {
  return unit === "hours" ? value * 60 : value;
}

export function TimeDurationSetting({
  initialMinutes,
  onSaved,
}: {
  initialMinutes: number;
  onSaved: () => void;
}) {
  const { emailAccountId } = useAccount();

  const {
    handleSubmit,
    setValue: setFormValue,
    reset,
  } = useForm<UpdateMeetingBriefsMinutesBeforeBody>({
    resolver: zodResolver(updateMeetingBriefsMinutesBeforeBody),
    defaultValues: { minutesBefore: initialMinutes },
  });

  const [value, setValue] = useState(
    () => minutesToValueAndUnit(initialMinutes).value,
  );
  const [unit, setUnit] = useState<Unit>(
    () => minutesToValueAndUnit(initialMinutes).unit,
  );

  const { executeAsync, isExecuting } = useAction(
    updateMeetingBriefsMinutesBeforeAction.bind(null, emailAccountId),
  );

  const onSubmit = useCallback(
    async (data: UpdateMeetingBriefsMinutesBeforeBody) => {
      const result = await executeAsync(data);

      if (result?.serverError) {
        toastError({ description: result.serverError });
        return;
      }

      toastSuccess({ description: "Settings saved!" });
      onSaved();
    },
    [executeAsync, onSaved],
  );

  const onError = useCallback(
    (errors: FieldErrors<UpdateMeetingBriefsMinutesBeforeBody>) => {
      const msg = errors.minutesBefore?.message;
      if (msg) toastError({ description: msg });
    },
    [],
  );

  const updateAndSubmit = useCallback(
    (nextMinutesBefore: number) => {
      setFormValue("minutesBefore", nextMinutesBefore, {
        shouldValidate: true,
      });
      handleSubmit(onSubmit, onError)();
    },
    [handleSubmit, onError, onSubmit, setFormValue],
  );

  // Keep local UI in sync if the server value changes (e.g. after revalidation)
  useEffect(() => {
    const parsed = minutesToValueAndUnit(initialMinutes);
    setValue(parsed.value);
    setUnit(parsed.unit);
    reset({ minutesBefore: initialMinutes });
  }, [initialMinutes, reset]);

  return (
    <form
      className="flex items-center gap-1"
      onSubmit={handleSubmit(onSubmit, onError)}
    >
      <Input
        type="number"
        min={1}
        value={value}
        onChange={(e) => {
          const nextValue = Number(e.target.value) || 1;
          setValue(nextValue);
          updateAndSubmit(valueAndUnitToMinutes(nextValue, unit));
        }}
        className="w-20"
      />
      <Select
        value={unit}
        onValueChange={(v) => {
          const nextUnit = v as Unit;
          setUnit(nextUnit);
          updateAndSubmit(valueAndUnitToMinutes(value, nextUnit));
        }}
      >
        <SelectTrigger className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="minutes">minutes</SelectItem>
          <SelectItem value="hours">hours</SelectItem>
        </SelectContent>
      </Select>
      {isExecuting && <LoadingMiniSpinner />}
    </form>
  );
}
