"use client";

import { CheckIcon } from "lucide-react";
import { cn } from "@/utils";

type RadioCardOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
  /** Short qualifier shown next to the label, e.g. "Recommended". */
  badge?: string;
};

/**
 * A one-of-N choice where each option needs a sentence of explanation, so a
 * Select (which hides the descriptions until opened) reads badly. Built on
 * native radios: arrow-key navigation and a single tab stop come for free.
 */
export function RadioCardGroup<T extends string>({
  name,
  ariaLabel,
  value,
  onChange,
  options,
  disabled,
}: {
  /** Must be unique on the page; groups the underlying radio inputs. */
  name: string;
  ariaLabel: string;
  value: T;
  onChange: (value: T) => void;
  options: RadioCardOption<T>[];
  disabled?: boolean;
}) {
  return (
    <fieldset
      aria-label={ariaLabel}
      className="divide-y overflow-hidden rounded-lg border"
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <label
            key={option.value}
            className={cn(
              "flex items-start gap-3 p-4 transition-colors",
              selected && "bg-accent/40",
              disabled
                ? "cursor-not-allowed opacity-60"
                : "cursor-pointer hover:bg-accent/50",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              disabled={disabled}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />

            <span
              className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input",
              )}
            >
              {selected && <CheckIcon className="size-3" />}
            </span>

            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2 text-sm font-medium leading-snug">
                {option.label}
                {option.badge && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {option.badge}
                  </span>
                )}
              </span>
              {option.description && (
                <span className="text-sm text-muted-foreground">
                  {option.description}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
