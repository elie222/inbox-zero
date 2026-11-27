import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * Reports whether the viewport is below the mobile breakpoint, or `undefined`
 * during SSR and initial hydration before client measurement runs.
 */
export function useIsMobileState(): boolean | undefined {
  return React.useSyncExternalStore(
    subscribeToMobileViewport,
    getIsMobileSnapshot,
    getServerIsMobileSnapshot,
  );
}

export function useIsMobile() {
  return !!useIsMobileState();
}

function subscribeToMobileViewport(onChange: () => void) {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return () => {};
  }
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getIsMobileSnapshot(): boolean | undefined {
  if (typeof window === "undefined") return;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function getServerIsMobileSnapshot(): boolean | undefined {
  return;
}
