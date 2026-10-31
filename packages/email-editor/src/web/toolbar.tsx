import type { ReactNode } from "react";
import styles from "./EmailEditor.module.css";

export function ToolbarButton({
  active,
  children,
  disabled = false,
  label,
  onPress,
}: {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={`${styles.toolbarButton} ${active ? styles.toolbarButtonActive : ""}`}
      disabled={disabled}
      onClick={onPress}
      onMouseDown={(event) => event.preventDefault()}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

export function FormattingIcon({
  kind,
}: {
  kind: "bullets" | "numbers" | "quote" | "ltr" | "rtl" | "link";
}) {
  const paths = {
    bullets: "M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01",
    numbers: "M10 6h11M10 12h11M10 18h11M3 4h1v5M3 9h2M3 14c3-2 4 1 1 3l-1 2h3",
    quote: "M9 5H3v7h5c0 4-2 6-5 7M21 5h-6v7h5c0 4-2 6-5 7",
    ltr: "M4 4h16M4 9h10M4 14h16M4 20h14M15 17l3 3-3 3",
    rtl: "M4 4h16M10 9h10M4 14h16M6 20h14M9 17l-3 3 3 3",
    link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",
  };
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[kind]} />
    </svg>
  );
}
