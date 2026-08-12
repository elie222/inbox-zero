"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { XIcon } from "lucide-react";
import type { EmailLabel } from "@/providers/email-label-types";
import { cn } from "@/utils";

export type MailLabelChipProps = {
  name: string;
  /** The color assigned by Gmail or Outlook. */
  color?: EmailLabel["color"];
  /** Interactive: the chip navigates to that label's view. */
  href?: string;
  /** Interactive: reveals a `×` on hover that removes the label. */
  onRemove?: () => void;
  className?: string;
};

/**
 * A label pill. Provider colors take precedence; otherwise its color comes from
 * the name, so a label reads the same everywhere. Without `href` or `onRemove`
 * the chip is inert; each adds its own affordance — a link on the name, and a
 * `×` revealed on hover.
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
        CHIP_CLASSES[chipColorForLabel(name)],
        className,
      )}
      style={providerColorStyle(color)}
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

/**
 * The chip palette, and the only place it is spelled out: `ChipColor` and
 * `CHIP_COLORS` both derive from these keys, so a new colour is picked up by the
 * hash the moment it is added here.
 *
 * bg / border / text, light-scoped: the Mail palette has no dark variant.
 */
const CHIP_CLASSES = {
  blue: "bg-new-blue-50 border-new-blue-150 text-primary",
  green: "bg-new-green-50 border-new-green-150 text-new-green-600",
  purple: "bg-new-purple-50 border-new-purple-200 text-new-purple-600",
  orange: "bg-new-orange-50 border-new-orange-150 text-new-orange-600",
  red: "bg-new-red-50 border-new-red-150 text-new-red-500",
  gray: "bg-new-gray-100 border-new-gray-150 text-new-gray-550",
  cyan: "bg-new-cyan-100 border-new-cyan-200 text-new-cyan-700",
  yellow: "bg-new-yellow-50 border-new-yellow-150 text-new-yellow-600",
};

type ChipColor = keyof typeof CHIP_CLASSES;

/** The colours the hash can land on. Exported so tests assert against the palette itself. */
export const CHIP_COLORS = Object.keys(CHIP_CLASSES) as ChipColor[];

/** Lowercased, so a label keeps its colour however the provider cases it. */
const NAMED_CHIP_COLORS: Record<string, ChipColor> = {
  "to reply": "blue",
  notification: "green",
  receipt: "orange",
  "cold email": "red",
  newsletter: "purple",
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

function providerColorStyle(
  color: EmailLabel["color"],
): CSSProperties | undefined {
  if (!color?.backgroundColor) return;

  return {
    backgroundColor: color.backgroundColor,
    borderColor: color.backgroundColor,
    color: color.textColor || contrastingTextColor(color.backgroundColor),
  };
}

export function contrastingTextColor(backgroundColor: string) {
  const hex = backgroundColor.trim();
  if (!/^#[\da-f]{6}$/i.test(hex)) return;

  const red = linearColorChannel(hex.slice(1, 3));
  const green = linearColorChannel(hex.slice(3, 5));
  const blue = linearColorChannel(hex.slice(5, 7));
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);

  return blackContrast >= whiteContrast ? "#000000" : "#ffffff";
}

function linearColorChannel(hex: string) {
  const channel = Number.parseInt(hex, 16) / 255;
  return channel <= 0.040_45
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}
