import type { EmailLabel } from "@/providers/email-label-types";

// Fallback palette for labels without a provider-assigned color, so every
// label gets a stable color derived from its name.
const FALLBACK_LABEL_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#d946ef", // fuchsia
  "#ec4899", // pink
];

export function getLabelDisplayColor(
  label: Pick<EmailLabel, "name" | "color">,
): string {
  if (label.color?.backgroundColor) return label.color.backgroundColor;

  let hash = 0;
  for (const char of label.name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return FALLBACK_LABEL_COLORS[hash % FALLBACK_LABEL_COLORS.length];
}
