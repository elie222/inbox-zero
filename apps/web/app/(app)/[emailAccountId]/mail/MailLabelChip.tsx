"use client";

import Link from "next/link";
import { XIcon } from "lucide-react";
import type { ChipColor } from "@/app/(app)/[emailAccountId]/mail/types";
import { cn } from "@/utils";

export type MailLabelChipProps = {
  name: string;
  /** Defaults to `chipColorForLabel(name)` so a label reads the same everywhere. */
  color?: ChipColor;
  /** Interactive: the chip navigates to that label's view. */
  href?: string;
  /** Interactive: reveals a `×` on hover that removes the label. */
  onRemove?: () => void;
  className?: string;
};

/**
 * A label pill. Rows pass neither `href` nor `onRemove` and get an inert chip;
 * the reader passes both and gets a link with a hover remove affordance.
 */
export function MailLabelChip({
  name,
  color,
  href,
  onRemove,
  className,
}: MailLabelChipProps) {
  return (
    <span
      className={cn(
        "group/chip inline-flex min-w-0 max-w-full items-center gap-0.5 whitespace-nowrap rounded-md border px-1.5 py-px text-xs leading-4",
        CHIP_CLASSES[color ?? chipColorForLabel(name)],
        className,
      )}
    >
      {href ? (
        <Link className="min-w-0 truncate hover:underline" href={href}>
          {name}
        </Link>
      ) : (
        <span className="min-w-0 truncate">{name}</span>
      )}
      {onRemove ? (
        <button
          aria-label={`Remove ${name} label`}
          className="-mr-0.5 shrink-0 rounded-sm opacity-0 transition-opacity focus-visible:opacity-100 group-hover/chip:opacity-100"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
          type="button"
        >
          <XIcon className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

/** bg / border / text, light-scoped: the Mail palette has no dark variant. */
const CHIP_CLASSES: Record<ChipColor, string> = {
  blue: "bg-new-blue-50 border-new-blue-150 text-primary",
  green: "bg-new-green-50 border-new-green-150 text-new-green-600",
  purple: "bg-new-purple-50 border-new-purple-200 text-new-purple-600",
  orange: "bg-new-orange-50 border-new-orange-150 text-new-orange-600",
  red: "bg-new-red-50 border-new-red-150 text-new-red-500",
  gray: "bg-new-gray-100 border-new-gray-150 text-new-gray-550",
  cyan: "bg-new-cyan-100 border-new-cyan-200 text-new-cyan-700",
  yellow: "bg-new-yellow-50 border-new-yellow-150 text-new-yellow-600",
};

const CHIP_COLORS: readonly ChipColor[] = [
  "blue",
  "green",
  "purple",
  "orange",
  "red",
  "gray",
  "cyan",
  "yellow",
];

/** Lowercased, so a label keeps its colour however the provider cases it. */
const NAMED_CHIP_COLORS: Record<string, ChipColor> = {
  "to reply": "blue",
  notification: "green",
  receipt: "orange",
  "cold email": "red",
  newsletter: "gray",
  actioned: "orange",
  "awaiting reply": "cyan",
  calendar: "yellow",
  "customer feedback": "purple",
};

/**
 * The colour a label wears. Product labels have a fixed colour; everything else
 * hashes into the palette so a user's own label keeps one colour forever rather
 * than flickering between renders.
 */
export function chipColorForLabel(name: string): ChipColor {
  // Hash the same normalized key the named lookup uses, so a label doesn't
  // change colour when the provider varies its casing or padding.
  const key = name.trim().toLowerCase();
  const named = NAMED_CHIP_COLORS[key];
  if (named) return named;

  // djb2
  let hash = 5381;
  for (let index = 0; index < key.length; index++) {
    hash = (hash * 33 + key.charCodeAt(index)) % 0xff_ff_ff;
  }

  return CHIP_COLORS[hash % CHIP_COLORS.length];
}
