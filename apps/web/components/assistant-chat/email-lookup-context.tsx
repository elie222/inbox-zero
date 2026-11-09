"use client";

import { createContext, useContext } from "react";

export type EmailMeta = {
  messageId: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  isUnread: boolean;
  externalUrl?: string;
};

export type EmailLookup = Map<string, EmailMeta>;

const EmailLookupContext = createContext<EmailLookup>(new Map());

export const EmailLookupProvider = EmailLookupContext.Provider;

export function useEmailLookup() {
  return useContext(EmailLookupContext);
}

// Thread IDs that tool results in this chat returned. Null outside a chat,
// where every ID is trusted.
const KnownThreadIdsContext = createContext<Set<string> | null>(null);

export const KnownThreadIdsProvider = KnownThreadIdsContext.Provider;

export function useKnownThreadIds() {
  return useContext(KnownThreadIdsContext);
}

export function collectToolThreadIds(
  messages: Array<{ parts?: Array<{ type: string }> }>,
) {
  const threadIds = new Set<string>();
  const collect = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    for (const [key, entry] of Object.entries(value)) {
      if (key === "threadId" && typeof entry === "string") {
        threadIds.add(entry);
      } else if (key === "threadIds" && Array.isArray(entry)) {
        for (const id of entry) if (typeof id === "string") threadIds.add(id);
      } else {
        collect(entry);
      }
    }
  };

  for (const message of messages) {
    for (const part of message.parts ?? []) {
      if (!part.type.startsWith("tool-") || !isSuccessfulOutput(part)) continue;
      collect(part.output);
    }
  }
  return threadIds;
}

function isSuccessfulOutput(
  part: object,
): part is { state: "output-available"; output: unknown } {
  if (!("state" in part) || part.state !== "output-available") return false;
  const output = "output" in part ? part.output : undefined;
  return !(typeof output === "object" && output !== null && "error" in output);
}
