"use client";

import { Label, ExplainText } from "@/components/Input";
import type { SettingsProperty } from "@inbox-zero/plugin-sdk";
import type { UseFormRegister, UseFormWatch } from "react-hook-form";
import { cn } from "@/utils";

interface SettingSliderFieldProps {
  fieldKey: string;
  property: SettingsProperty;
  register: UseFormRegister<any>;
  watch: UseFormWatch<any>;
}

export function SettingSliderField({
  fieldKey,
  property,
  register,
  watch,
}: SettingSliderFieldProps) {
  const min = property.minimum ?? 0;
  const max = property.maximum ?? 100;
  const defaultValue = (property.default as number) ?? min;

  const currentValue = watch(fieldKey, defaultValue);

  // convert value to label if enum is provided
  const getValueLabel = (value: number) => {
    if (property.enum && property.enum.length > 0) {
      const index = Math.round(
        ((value - min) / (max - min)) * (property.enum.length - 1),
      );
      return String(property.enum[index]);
    }
    return value.toString();
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <Label name={fieldKey} label={property.title || fieldKey} />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {getValueLabel(currentValue)}
        </span>
      </div>
      <div className="mt-2">
        <input
          type="range"
          id={fieldKey}
          min={min}
          max={max}
          step={1}
          className={cn(
            "h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 dark:bg-slate-700",
            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer",
            "[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0",
          )}
          {...register(fieldKey, { valueAsNumber: true })}
        />
        {property.description && (
          <div className="mt-1">
            <ExplainText>{property.description}</ExplainText>
          </div>
        )}
      </div>
    </div>
  );
}
