"use client";

import { useEffect, useState } from "react";
import { HistoryIcon } from "lucide-react";
import useSWR from "swr";
import type { ContactsResponse } from "@/app/api/user/contacts/route";
import { matchRecentSearches } from "@/store/mail-search-history";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { env } from "@/env";
import { cn } from "@/utils";

export type MailSearchSuggestion = {
  /** Query committed when the suggestion is chosen. */
  query: string;
} & (
  | { kind: "recent" }
  | {
      kind: "contact";
      name?: string;
      emailAddress: string;
      profilePictureUrl?: string;
    }
);

export function useMailSearchSuggestions({
  draft,
  emailAccountId,
  enabled,
  recentSearches,
}: {
  draft: string;
  emailAccountId: string;
  enabled: boolean;
  recentSearches: string[];
}): MailSearchSuggestion[] {
  const normalizedDraft = draft.trim().toLowerCase();
  const [debouncedDraft, setDebouncedDraft] = useState("");
  const [contactsUnavailable, setContactsUnavailable] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedDraft(normalizedDraft), 200);
    return () => clearTimeout(timeout);
  }, [normalizedDraft]);

  const { data: contacts } = useSWR<ContactsResponse>(
    enabled &&
      env.NEXT_PUBLIC_CONTACTS_ENABLED &&
      !contactsUnavailable &&
      debouncedDraft
      ? [
          `/api/user/contacts?query=${encodeURIComponent(debouncedDraft)}`,
          emailAccountId,
        ]
      : null,
    {
      dedupingInterval: 5 * 60 * 1000,
      keepPreviousData: false,
      onError: () => setContactsUnavailable(true),
    },
  );

  if (!enabled) return [];

  const recent: MailSearchSuggestion[] = matchRecentSearches(
    recentSearches,
    draft,
  ).map((query) => ({ kind: "recent", query }));

  // Contacts for a stale draft would flash and then reshuffle under the
  // pointer, so they only show once the debounced fetch matches the input.
  const matchedContacts =
    normalizedDraft && normalizedDraft === debouncedDraft
      ? (contacts?.contacts ?? [])
      : [];
  const contactSuggestions: MailSearchSuggestion[] = matchedContacts.map(
    (contact) => ({
      kind: "contact",
      query: contact.emailAddress,
      name: contact.name,
      emailAddress: contact.emailAddress,
      profilePictureUrl: contact.profilePictureUrl,
    }),
  );

  return [...recent, ...contactSuggestions];
}

export function MailSearchSuggestionList({
  activeIndex,
  id,
  onSelect,
  suggestions,
}: {
  activeIndex: number;
  id: string;
  onSelect: (suggestion: MailSearchSuggestion) => void;
  suggestions: MailSearchSuggestion[];
}) {
  return (
    <div
      aria-label="Search suggestions"
      className="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-lg border border-border bg-popover py-1 text-popover-foreground text-sm shadow-md"
      id={id}
      role="listbox"
    >
      {suggestions.map((suggestion, index) => (
        <div
          aria-selected={index === activeIndex}
          className={cn(
            "flex cursor-pointer items-center gap-3 px-3 py-1.5",
            index === activeIndex && "bg-accent text-accent-foreground",
          )}
          id={suggestionOptionId(id, index)}
          key={`${suggestion.kind}:${suggestion.query}`}
          // Selecting on mousedown keeps the input focused, which is what
          // holds the list open long enough for the click to land.
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(suggestion);
          }}
          role="option"
          // Focus stays on the input; aria-activedescendant conveys the
          // highlighted option.
          tabIndex={-1}
        >
          {suggestion.kind === "recent" ? (
            <>
              <HistoryIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate text-foreground">
                {suggestion.query}
              </span>
            </>
          ) : (
            <>
              <Avatar className="size-6">
                <AvatarImage
                  alt=""
                  src={suggestion.profilePictureUrl ?? undefined}
                />
                <AvatarFallback className="text-xs">
                  {(suggestion.name || suggestion.emailAddress)
                    .at(0)
                    ?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="flex min-w-0 flex-col">
                {suggestion.name ? (
                  <span className="truncate font-medium text-foreground">
                    {suggestion.name}
                  </span>
                ) : null}
                <span className="truncate text-muted-foreground text-xs">
                  {suggestion.emailAddress}
                </span>
              </span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export function suggestionOptionId(listId: string, index: number) {
  return `${listId}-option-${index}`;
}
