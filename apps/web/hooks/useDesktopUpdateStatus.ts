"use client";

import { useSyncExternalStore } from "react";
import {
  type DesktopUpdateStatus,
  getInboxZeroDesktopApp,
} from "@/utils/desktop-app";

let status: DesktopUpdateStatus = null;
const listeners = new Set<() => void>();
let unsubscribe: (() => void) | undefined;

export function useDesktopUpdateStatus() {
  return useSyncExternalStore(
    subscribe,
    () => status,
    () => null,
  );
}

function subscribe(listener: () => void) {
  const desktop = getInboxZeroDesktopApp();
  if (!desktop?.onUpdateStatus || !desktop.installUpdate) return () => {};
  listeners.add(listener);
  if (listeners.size === 1) {
    unsubscribe = desktop.onUpdateStatus((next) => {
      status = next;
      for (const notify of listeners) notify();
    });
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      unsubscribe?.();
      unsubscribe = undefined;
      status = null;
    }
  };
}
