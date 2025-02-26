"use client";

import type { FieldError } from "react-hook-form";
import { Radio, RadioGroup as HeadlessRadioGroup } from "@headlessui/react";
import { cn } from "@/utils";
import { Label } from "@/components/Input";
import { ErrorMessage } from "@/components/Input";

type RadioOption<T extends string> = {
  value: T;
  label: string;
  description: string;
};

type RadioGroupProps<T extends string> = {
  label: string;
  options: RadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  error?: FieldError;
};

export function RadioGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  error,
}: RadioGroupProps<T>) {
  return (
    <fieldset aria-label={label}>
      {label ? (
        <div className="mb-2">
          <Label name={label} label={label} />
        </div>
      ) : null}

      <HeadlessRadioGroup
        value={value}
        onChange={onChange}
        className="bg-background -space-y-px rounded-md"
      >
        {options.map((option, optionIdx) => (
          <Radio
            key={option.value}
            value={option.value}
            aria-label={option.label}
            aria-describedby={option.description}
            className={cn(
              optionIdx === 0 ? "rounded-tl-md rounded-tr-md" : "",
              optionIdx === options.length - 1
                ? "rounded-br-md rounded-bl-md"
                : "",
              "group relative flex cursor-pointer border border-gray-200 p-4 focus:outline-hidden data-checked:z-10 data-checked:border-slate-200 data-checked:bg-slate-50",
              "dark:border-slate-700 dark:data-checked:border-slate-600 dark:data-checked:bg-slate-800/50",
            )}
          >
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-gray-300 group-data-checked:border-transparent group-data-checked:bg-slate-600 group-data-focus:ring-2 group-data-focus:ring-slate-600 group-data-focus:ring-offset-2 dark:border-slate-600 dark:group-data-checked:bg-slate-400 dark:group-data-focus:ring-slate-400 dark:group-data-focus:ring-offset-slate-900"
            >
              <span className="bg-background h-1.5 w-1.5 rounded-full" />
            </span>
            <span className="ml-3 flex flex-col">
              <span className="text-primary group-data-checked:text-primary block text-sm font-medium dark:text-slate-100 dark:group-data-checked:text-white">
                {option.label}
              </span>
              <span className="text-muted-foreground block text-sm group-data-checked:text-slate-700 dark:text-slate-400 dark:group-data-checked:text-slate-300">
                {option.description}
              </span>
            </span>
          </Radio>
        ))}
      </HeadlessRadioGroup>

      {error?.message ? <ErrorMessage message={error?.message} /> : null}
    </fieldset>
  );
}
