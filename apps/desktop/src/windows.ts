import { getDesktopSessionRestoreUrl } from "./desktop";

export const DEFAULT_DESKTOP_WINDOW_WIDTH = 1280;
export const DEFAULT_DESKTOP_WINDOW_HEIGHT = 840;
export const MIN_DESKTOP_WINDOW_WIDTH = 900;
export const MIN_DESKTOP_WINDOW_HEIGHT = 640;
export const MAX_DESKTOP_WINDOWS = 8;

export type DesktopWindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DesktopWindowState = {
  url: string;
  bounds?: DesktopWindowBounds;
  isMaximized?: boolean;
};

export function parseDesktopWindowStates(
  raw: unknown,
  appOrigin: string,
): DesktopWindowState[] {
  if (!Array.isArray(raw)) return [];

  const states: DesktopWindowState[] = [];
  for (const item of raw) {
    const state = parseDesktopWindowState(item, appOrigin);
    if (state) states.push(state);
    if (states.length >= MAX_DESKTOP_WINDOWS) break;
  }
  return states;
}

export function fitWindowBoundsToWorkArea(
  bounds: DesktopWindowBounds,
  workArea: DesktopWindowBounds,
): DesktopWindowBounds {
  const width = clamp(
    Math.round(bounds.width),
    MIN_DESKTOP_WINDOW_WIDTH,
    Math.max(MIN_DESKTOP_WINDOW_WIDTH, workArea.width),
  );
  const height = clamp(
    Math.round(bounds.height),
    MIN_DESKTOP_WINDOW_HEIGHT,
    Math.max(MIN_DESKTOP_WINDOW_HEIGHT, workArea.height),
  );
  const maxX = workArea.x + workArea.width - width;
  const maxY = workArea.y + workArea.height - height;
  const overlaps = rectanglesOverlap(bounds, workArea);

  return {
    x: overlaps
      ? clamp(Math.round(bounds.x), workArea.x, Math.max(workArea.x, maxX))
      : workArea.x + Math.round((workArea.width - width) / 2),
    y: overlaps
      ? clamp(Math.round(bounds.y), workArea.y, Math.max(workArea.y, maxY))
      : workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height,
  };
}

function parseDesktopWindowState(
  raw: unknown,
  appOrigin: string,
): DesktopWindowState | null {
  if (!isRecord(raw) || typeof raw.url !== "string") return null;
  const url = getDesktopSessionRestoreUrl(appOrigin, raw.url);
  if (!url) return null;

  if (!("bounds" in raw)) return { url, isMaximized: raw.isMaximized === true };

  const bounds = parseDesktopWindowBounds(raw.bounds);
  if (!bounds) return null;
  return { url, bounds, isMaximized: raw.isMaximized === true };
}

function parseDesktopWindowBounds(raw: unknown): DesktopWindowBounds | null {
  if (!isRecord(raw)) return null;
  const { x, y, width, height } = raw;
  if (
    !isFiniteNumber(x) ||
    !isFiniteNumber(y) ||
    !isFiniteNumber(width) ||
    !isFiniteNumber(height) ||
    width < MIN_DESKTOP_WINDOW_WIDTH ||
    height < MIN_DESKTOP_WINDOW_HEIGHT
  ) {
    return null;
  }
  return { x, y, width, height };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function rectanglesOverlap(
  left: DesktopWindowBounds,
  right: DesktopWindowBounds,
): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
