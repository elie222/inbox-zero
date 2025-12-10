"use client";

import { useCallback, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { updateMeetingBriefsSettingsAction } from "@/utils/actions/meeting-briefs";

type Unit = "minutes" | "hours";

function minutesToValueAndUnit(totalMinutes: number): {
  value: number;
  unit: Unit;
} {
  // If divisible by 60 and >= 60, use hours
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
  enabled,
  onSaved,
}: {
  initialMinutes: number;
  enabled: boolean;
  onSaved: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [value, setValue] = useState(() => {
    const { value } = minutesToValueAndUnit(initialMinutes);
    return value;
  });
  const [unit, setUnit] = useState<Unit>(() => {
    const { unit } = minutesToValueAndUnit(initialMinutes);
    return unit;
  });

  const { execute, isExecuting } = useAction(
    updateMeetingBriefsSettingsAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Settings saved!" });
        onSaved();
      },
      onError: () => {
        toastError({ description: "Failed to save settings" });
      },
    },
  );

  const handleSave = useCallback(() => {
    const totalMinutes = valueAndUnitToMinutes(value, unit);
    if (totalMinutes < 5) {
      toastError({ description: "Minimum is 5 minutes" });
      return;
    }
    if (totalMinutes > 2880) {
      toastError({ description: "Maximum is 48 hours" });
      return;
    }
    execute({ enabled, minutesBefore: totalMinutes });
  }, [execute, enabled, value, unit]);

  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min={1}
        value={value}
        onChange={(e) => setValue(Number(e.target.value) || 1)}
        className="w-20"
      />
      <Select value={unit} onValueChange={(v) => setUnit(v as Unit)}>
        <SelectTrigger className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="minutes">minutes</SelectItem>
          <SelectItem value="hours">hours</SelectItem>
        </SelectContent>
      </Select>
      <Button onClick={handleSave} loading={isExecuting} size="sm">
        Save
      </Button>
    </div>
  );
}
