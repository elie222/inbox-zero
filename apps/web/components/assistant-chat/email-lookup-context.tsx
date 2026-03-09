"use client";

import { createContext, useContext } from "react";

export type EmailMeta = {
  messageId: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  isUnread: boolean;
};

export type EmailLookup = Map<string, EmailMeta>;

const EmailLookupContext = createContext<EmailLookup>(new Map());

export const EmailLookupProvider = EmailLookupContext.Provider;

export function useEmailLookup() {
  return useContext(EmailLookupContext);
}
