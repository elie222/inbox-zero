import {
  getDesktopSessionRestoreUrl,
  shouldPersistDesktopUrl,
} from "./desktop";

export const DEFAULT_DESKTOP_WINDOW_WIDTH = 1280;
export const DEFAULT_DESKTOP_WINDOW_HEIGHT = 840;
export const MIN_DESKTOP_WINDOW_WIDTH = 900;
export const MIN_DESKTOP_WINDOW_HEIGHT = 640;
export const MAX_DESKTOP_WINDOWS = 8;
export const NEW_WINDOW_OFFSET = 28;

export type DesktopWindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DesktopWindowState = {
  url: string;
  bounds: DesktopWindowBounds;
  isMaximized: boolean;
};

export function parseDesktopWindowStates(
  raw: unknown,
  appOrigin: string,
): DesktopWindowState[] {
  if (!Array.isArray(raw)) return [];

  const states: DesktopWindowState[] = [];
  for (const item of raw) {
    if (states.length >= MAX_DESKTOP_WINDOWS) break;
    const state = parseDesktopWindowState(item, appOrigin);
    if (state) states.push(state);
  }
  return states;
}

export function getRestoredDesktopWindows(
  states: readonly DesktopWindowState[],
  appOrigin: string,
): DesktopWindowState[] {
  const restored: DesktopWindowState[] = [];
  for (const state of states) {
    if (restored.length >= MAX_DESKTOP_WINDOWS) break;
    const url = getDesktopSessionRestoreUrl(appOrigin, state.url);
    if (url) restored.push({ ...state, url });
  }
  return restored;
}

export function getLegacyDesktopWindowStates(
  lastAppUrl: string | null,
  appOrigin: string,
): DesktopWindowState[] {
  const url = getDesktopSessionRestoreUrl(appOrigin, lastAppUrl);
  if (!url) return [];
  return [
    {
      url,
      bounds: {
        x: 0,
        y: 0,
        width: DEFAULT_DESKTOP_WINDOW_WIDTH,
        height: DEFAULT_DESKTOP_WINDOW_HEIGHT,
      },
      isMaximized: false,
    },
  ];
}

export function collectDesktopWindowStates(
  windows: readonly DesktopWindowState[],
  appOrigin: string,
): DesktopWindowState[] {
  return windows
    .filter((window) => shouldPersistDesktopUrl(window.url, appOrigin))
    .slice(0, MAX_DESKTOP_WINDOWS);
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

export function offsetWindowBounds(
  bounds: DesktopWindowBounds,
  offset = NEW_WINDOW_OFFSET,
): DesktopWindowBounds {
  return {
    x: bounds.x + offset,
    y: bounds.y + offset,
    width: bounds.width,
    height: bounds.height,
  };
}

export function getDesktopUnreadBadgeCount(counts: Iterable<number>): number {
  let max = 0;
  for (const count of counts) {
    if (Number.isSafeInteger(count) && count > max) max = count;
  }
  return max;
}

export function shouldReuseSoleHiddenWindow(
  windowCount: number,
  visibleCount: number,
): boolean {
  return windowCount === 1 && visibleCount === 0;
}

function parseDesktopWindowState(
  raw: unknown,
  appOrigin: string,
): DesktopWindowState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (!("url" in raw) || typeof raw.url !== "string") return null;
  if (!shouldPersistDesktopUrl(raw.url, appOrigin)) return null;

  const bounds = parseDesktopWindowBounds(
    "bounds" in raw ? raw.bounds : undefined,
  );
  if (!bounds) return null;

  return {
    url: raw.url,
    bounds,
    isMaximized: "isMaximized" in raw && raw.isMaximized === true,
  };
}

function parseDesktopWindowBounds(raw: unknown): DesktopWindowBounds | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const x = readFiniteNumber(raw, "x");
  const y = readFiniteNumber(raw, "y");
  const width = readFiniteNumber(raw, "width");
  const height = readFiniteNumber(raw, "height");
  if (x === null || y === null || width === null || height === null) {
    return null;
  }
  if (width < MIN_DESKTOP_WINDOW_WIDTH || height < MIN_DESKTOP_WINDOW_HEIGHT) {
    return null;
  }
  return { x, y, width, height };
}

function readFiniteNumber(raw: object, key: string): number | null {
  if (!(key in raw)) return null;
  const value = (raw as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
