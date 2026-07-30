"use client";

import { cn } from "@/utils";

type RadioCardOption<T extends string> = {
  value: T;
  label: string;
  /** Short qualifier shown next to the label, e.g. "Recommended". */
  badge?: string;
};

/**
 * A one-of-N choice laid out as a card of rows, for decisions where the
 * options should all be visible rather than hidden behind a Select.
 *
 * Labels only, by design — a description under every option reads as noise.
 * If an option needs explaining, the label is wrong.
 *
 * Built on native radios: arrow-key navigation and a single tab stop come for
 * free.
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
      className="divide-y divide-border overflow-hidden rounded-xl border bg-card"
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <label
            key={option.value}
            className={cn(
              "flex items-center gap-3 px-4 py-3.5 transition-colors",
              disabled
                ? "cursor-not-allowed opacity-60"
                : "cursor-pointer hover:bg-accent/40",
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
                "size-4 shrink-0 rounded-full border transition-colors",
                "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
                selected
                  ? "border-[5px] border-primary bg-background"
                  : "border-input",
              )}
            />

            <span className="flex items-center gap-2 text-sm">
              {option.label}
              {option.badge && (
                <span className="text-xs text-muted-foreground">
                  {option.badge}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
