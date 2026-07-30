// The card's look & feel choices, shared by the My Card drawer, the public
// page, and the write-path validation. accentColor reaches inline styles on
// the public page, so only values from this fixed palette are ever stored.

export const CARD_ACCENTS = [
  "#F14E23",
  "hsl(210 65% 55%)",
  "hsl(150 65% 55%)",
  "hsl(45 65% 55%)",
  "hsl(270 65% 55%)",
  "hsl(330 65% 55%)",
] as const;

export const CARD_AVATAR_MODES = ["initials", "photo", "logo"] as const;
export const CARD_AVATAR_SHAPES = ["circle", "rounded"] as const;
export const CARD_NAME_FONTS = ["serif", "sans"] as const;

export type CardAvatarMode = (typeof CARD_AVATAR_MODES)[number];
export type CardAvatarShape = (typeof CARD_AVATAR_SHAPES)[number];
export type CardNameFont = (typeof CARD_NAME_FONTS)[number];

// Anything not from the palette (or unset) renders as the brand orange
export function resolveCardAccent(value: string | null | undefined): string {
  return (CARD_ACCENTS as readonly string[]).includes(value ?? "")
    ? (value as string)
    : CARD_ACCENTS[0];
}

// Which image the card actually shows: a photo/logo mode without its URL
// falls back to initials rather than an empty box
export function resolveCardAvatarMode(card: {
  avatarMode: string;
  photoUrl: string | null;
  logoUrl: string | null;
}): CardAvatarMode {
  if (card.avatarMode === "photo" && card.photoUrl) return "photo";
  if (card.avatarMode === "logo" && card.logoUrl) return "logo";
  return "initials";
}

export function cardInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((word) => word[0])
      .filter(Boolean)
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}
