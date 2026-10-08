"use client";

import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import useSWR from "swr";
import type {
  ContactsErrorResponse,
  ContactsResponse,
} from "@/app/api/user/contacts/route";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { env } from "@/env";
import { cn } from "@/utils";
import {
  extractEmailAddress,
  extractNameFromEmail,
  isValidEmail,
  splitRecipientList,
} from "@/utils/email";
import {
  type ComposeRecipientField,
  resolveComposeRecipients,
  resolveRecipientSelection,
} from "./compose-recipients";
import {
  mergeContactSuggestions,
  useLocalContactSuggestions,
} from "./contact-suggestions";

const RECIPIENT_LABELS: Record<ComposeRecipientField, string> = {
  to: "To",
  cc: "Cc",
  bcc: "Bcc",
};

export function ComposeContactRecipientField({
  active,
  autoFocus,
  className,
  emailAccountId,
  ownAddresses,
  isReconnectingContacts,
  name,
  onActivate,
  onReconnectContacts,
  onReconnectRequired,
  onSearchQueryChange,
  onSelectedRecipientsChange,
  reconnectRequired,
  selectedRecipients,
}: {
  active: boolean;
  autoFocus?: boolean;
  className?: string;
  emailAccountId: string;
  ownAddresses: string[];
  isReconnectingContacts: boolean;
  name: ComposeRecipientField;
  onActivate: (field: ComposeRecipientField) => void;
  onReconnectContacts: () => void;
  onReconnectRequired: () => void;
  onSearchQueryChange: (field: ComposeRecipientField, query: string) => void;
  onSelectedRecipientsChange: (
    field: ComposeRecipientField,
    recipients: string,
  ) => void;
  reconnectRequired: boolean;
  selectedRecipients: string;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const label = RECIPIENT_LABELS[name];
  const selectedEmailAddresses = splitRecipientList(selectedRecipients);

  const { data: contacts } = useSWR<ContactsResponse, ContactsFetchError>(
    !env.NEXT_PUBLIC_CONTACTS_ENABLED || reconnectRequired || !active
      ? null
      : [
          `/api/user/contacts?query=${encodeURIComponent(debouncedQuery)}`,
          emailAccountId,
        ],
    {
      dedupingInterval: 5 * 60 * 1000,
      keepPreviousData: false,
      revalidateOnFocus: true,
      onError(error) {
        if (error.info?.reconnectRequired) onReconnectRequired();
      },
    },
  );

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(normalizedQuery), 150);
    return () => clearTimeout(timeout);
  }, [normalizedQuery]);

  const selectedAddresses = new Set(
    selectedEmailAddresses.map((address) =>
      extractEmailAddress(address).toLowerCase(),
    ),
  );
  const localContacts = useLocalContactSuggestions({
    emailAccountId,
    ownAddresses,
    selectedAddresses,
    query: debouncedQuery,
    active: active && normalizedQuery === debouncedQuery,
  });
  const suggestions =
    normalizedQuery && normalizedQuery === debouncedQuery
      ? mergeContactSuggestions(
          localContacts,
          contacts?.contacts ?? [],
          selectedAddresses,
        )
      : [];

  // The local input state resets on unmount (e.g. collapsing the recipient
  // fields), so the parent's pending entry must reset with it or hidden text
  // would still send.
  useEffect(
    () => () => onSearchQueryChange(name, ""),
    [name, onSearchQueryChange],
  );

  const updateSearchQuery = (query: string) => {
    setSearchQuery(query);
    onSearchQueryChange(name, query);
  };

  const removeSelectedEmail = (emailAddress: string) => {
    onSelectedRecipientsChange(
      name,
      selectedEmailAddresses
        .filter((email) => email !== emailAddress)
        .join(","),
    );
  };

  return (
    <Combobox
      multiple
      onChange={(values) => {
        const selection = resolveRecipientSelection(values);
        if (selection === null) return;
        onSelectedRecipientsChange(name, selection);
        updateSearchQuery("");
      }}
      value={selectedEmailAddresses}
    >
      <div
        className={cn(
          "flex min-h-10 w-full flex-1 flex-wrap items-center gap-1.5 rounded-md text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted-foreground",
          className,
        )}
      >
        {selectedEmailAddresses.map((emailAddress) => (
          <Badge className="rounded-md" key={emailAddress} variant="secondary">
            <button
              aria-label={`Edit ${emailAddress}`}
              className="cursor-pointer"
              onClick={() => {
                removeSelectedEmail(emailAddress);
                updateSearchQuery(emailAddress);
              }}
              type="button"
            >
              {extractNameFromEmail(emailAddress)}
            </button>
            <button
              aria-label={`Remove ${emailAddress}`}
              onClick={() => removeSelectedEmail(emailAddress)}
              type="button"
            >
              <XIcon className="ml-1.5 size-3" />
            </button>
          </Badge>
        ))}

        <div className="relative min-w-32 flex-1">
          <ComboboxInput
            aria-label={label}
            autoFocus={autoFocus}
            className="w-full border-none bg-background p-0 text-sm focus:border-none focus:ring-0"
            id={name}
            onChange={(event) => updateSearchQuery(event.target.value)}
            onFocus={() => onActivate(name)}
            onKeyUp={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (!isValidEmail(searchQuery.trim())) return;
              onSelectedRecipientsChange(
                name,
                resolveComposeRecipients({
                  selectedRecipients,
                  pendingRecipient: searchQuery,
                }),
              );
              updateSearchQuery("");
            }}
            value={searchQuery}
          />

          {active && env.NEXT_PUBLIC_CONTACTS_ENABLED && reconnectRequired && (
            <div
              className="absolute z-10 mt-1 flex w-80 items-center gap-3 rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-lg"
              role="status"
            >
              <span className="flex-1">
                Reconnect this account to enable contact suggestions.
              </span>
              <Button
                className="h-auto p-0"
                disabled={isReconnectingContacts}
                loading={isReconnectingContacts}
                onClick={onReconnectContacts}
                type="button"
                variant="link"
              >
                Reconnect
              </Button>
            </div>
          )}

          {active && !!suggestions.length && (
            <ComboboxOptions className="absolute z-20 mt-1 max-h-72 w-max min-w-full max-w-[min(28rem,calc(100vw-3rem))] overflow-auto rounded-md border bg-popover py-1 text-sm shadow-lg focus:outline-none">
              {suggestions.map((contact) => (
                <ComboboxOption
                  className={({ focus }) =>
                    `cursor-pointer select-none px-3 py-1 text-foreground ${focus ? "bg-accent" : ""}`
                  }
                  key={contact.emailAddress}
                  value={contact.emailAddress}
                >
                  <div className="my-2 flex items-center">
                    <Avatar className="shrink-0">
                      <AvatarImage
                        alt={contact.name ?? contact.emailAddress}
                        src={contact.profilePictureUrl ?? undefined}
                      />
                      <AvatarFallback>
                        {(contact.name || contact.emailAddress)
                          .at(0)
                          ?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="ml-3 flex min-w-0 flex-col justify-center">
                      {contact.name && (
                        <div className="truncate font-medium text-foreground">
                          {contact.name}
                        </div>
                      )}
                      <div className="truncate text-sm text-muted-foreground">
                        {contact.emailAddress}
                      </div>
                    </div>
                  </div>
                </ComboboxOption>
              ))}
            </ComboboxOptions>
          )}
        </div>
      </div>
    </Combobox>
  );
}

type ContactsFetchError = Error & {
  info?: Partial<ContactsErrorResponse>;
  status?: number;
};
