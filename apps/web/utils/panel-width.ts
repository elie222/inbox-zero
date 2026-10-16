export type PanelWidthConfig = {
  /** Remembers the width; read on the server so the first paint uses it. */
  cookie: string;
  /** The CSS variable the panel's width is driven by. */
  cssVar: `--${string}`;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
};

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

export function clampPanelWidth(
  config: PanelWidthConfig,
  width: number,
): number {
  if (!Number.isFinite(width)) return config.defaultWidth;
  return Math.min(
    config.maxWidth,
    Math.max(config.minWidth, Math.round(width)),
  );
}

export function parsePanelWidthCookie(
  config: PanelWidthConfig,
  value: string | undefined,
): number {
  return clampPanelWidth(config, Number.parseInt(value ?? "", 10));
}

export function persistPanelWidth(config: PanelWidthConfig, width: number) {
  document.cookie = `${config.cookie}=${width}; path=/; max-age=${ONE_YEAR_IN_SECONDS}; SameSite=Lax; Secure`;
}
