"use client";

import { createContext, useContext } from "react";

// Provided by pages that can open a contact-details sheet for an email
// address (the mail page). Null — no provider — means sender names render
// as plain text instead of links.
export const ContactPeekContext = createContext<
  ((email: string) => void) | null
>(null);

export function useContactPeek() {
  return useContext(ContactPeekContext);
}
