"use client";

import { useSyncExternalStore } from "react";

let savingThreads: string[] = [];
const listeners = new Set<() => void>();

/**
 * Marks a composer's mailbox save as running in a thread. Gmail stores each
 * save as a new message, and sync can deliver it before the save says which
 * open draft it belongs to. Returns a function that ends the save.
 */
export function startDraftSave(emailAccountId: string, threadId: string) {
  const key = saveKey(emailAccountId, threadId);
  savingThreads = [...savingThreads, key];
  notify();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    const index = savingThreads.indexOf(key);
    savingThreads = savingThreads.filter((_, i) => i !== index);
    notify();
  };
}

export function useDraftSaveInFlight(emailAccountId: string, threadId: string) {
  const key = saveKey(emailAccountId, threadId);
  return useSyncExternalStore(
    subscribe,
    () => savingThreads.includes(key),
    () => false,
  );
}

function saveKey(emailAccountId: string, threadId: string) {
  return `${emailAccountId}:${threadId}`;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  for (const listener of listeners) listener();
}
