// The card page owns its look rather than inheriting the app's theme tokens —
// it's meant to read as the cardholder's card, and it renders the same whether
// the visitor's device is in light or dark mode. Values come straight from the
// Claude Design mockup.
export const cardColors = {
  page: "#0a0e1a",
  panel: "#131826",
  panelAlt: "#1a1f2e",
  input: "#0d1220",
  border: "#232a3d",
  borderStrong: "#2f3852",
  text: "#f5f5f0",
  muted: "#a6adc2",
  dim: "#8a92a8",
  accent: "#ff6b3d",
  accentHover: "#e3552a",
  gold: "#f5b942",
  success: "#4ade80",
  error: "#ef4444",
} as const;

export const MONO = "var(--font-jetbrains-mono), ui-monospace, monospace";

// The mono eyebrows and row labels the design uses throughout
export function eyebrow(
  fontSize: number,
  letterSpacing: string,
  color: string = cardColors.accent,
) {
  return {
    fontFamily: MONO,
    fontSize,
    letterSpacing,
    textTransform: "uppercase" as const,
    color,
    margin: 0,
  };
}

export function panel(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    background: cardColors.panel,
    border: `1px solid ${cardColors.border}`,
    borderRadius: 14,
    ...extra,
  };
}

type Star = {
  left: string;
  top: string;
  size: string;
  color: string;
  opacity: number;
  animation: string;
};

// The mockup's seeded generator, kept exactly: a Lehmer RNG so the field is
// identical on the server and the client. Math.random() here would produce a
// different sky in each and trip a hydration mismatch.
function makeStars(count: number, sizeMax: number, seed: number): Star[] {
  let state = seed;
  const random = () => {
    state = (state * 16_807) % 2_147_483_647;
    return state / 2_147_483_647;
  };

  return Array.from({ length: count }, () => {
    const size = (0.8 + random() * sizeMax).toFixed(1);
    const color =
      random() < 0.12
        ? cardColors.accent
        : random() < 0.1
          ? cardColors.gold
          : cardColors.text;

    return {
      left: `${random() * 100}%`,
      top: `${random() * 130}%`,
      size: `${size}px`,
      color,
      opacity: 0.3 + random() * 0.6,
      animation: `twinkle ${(2.5 + random() * 5).toFixed(1)}s ease-in-out ${(random() * 6).toFixed(1)}s infinite`,
    };
  });
}

// Module scope: generated once at import, so every render agrees
export const farStars = makeStars(90, 1.4, 1_234_567);
export const nearStars = makeStars(40, 2.4, 7_654_321);
