"use client";

import { useState } from "react";
import useSWR from "swr";
import type { ContactsResponse } from "@/app/api/contacts/route";
import { ContactDetails } from "@/app/(app)/[emailAccountId]/contacts/ContactDetailSheet";
import { ContactPeekContext } from "@/components/email-list/contact-peek-context";
import { LoadingContent } from "@/components/LoadingContent";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAccount } from "@/providers/EmailAccountProvider";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import { type ContactListItem, emailDomain } from "@/utils/contacts";

// Wraps the mail page so any sender name inside it becomes a link that
// opens this contact sheet — the same details pane the Contacts page shows.
export function ContactPeekProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [email, setEmail] = useState<string | null>(null);

  return (
    <ContactPeekContext.Provider value={setEmail}>
      {children}
      <ContactPeekSheet email={email} onClose={() => setEmail(null)} />
    </ContactPeekContext.Provider>
  );
}

function ContactPeekSheet({
  email,
  onClose,
}: {
  email: string | null;
  onClose: () => void;
}) {
  const { emailAccountId } = useAccount();
  const normalized = email?.trim().toLowerCase() || null;

  const { data, isLoading, error, mutate } = useSWR<ContactsResponse>(
    normalized ? `contact-peek:${emailAccountId}:${normalized}` : null,
    async () => {
      const response = await fetch(
        `/api/contacts?search=${encodeURIComponent(normalized ?? "")}&limit=25`,
        { headers: { [EMAIL_ACCOUNT_HEADER]: emailAccountId } },
      );
      if (!response.ok) {
        throw new Error(`Failed to load contact (${response.status})`);
      }
      return response.json();
    },
  );

  // Senders without saved details or recent activity still get a sheet —
  // everything starts zeroed and saving creates the contact
  const contact =
    data?.contacts.find((candidate) => candidate.email === normalized) ??
    (normalized ? emptyContact(normalized) : null);

  return (
    <Sheet open={!!email} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="overflow-y-auto sm:max-w-xl">
        <SheetTitle className="sr-only">Contact details</SheetTitle>
        {normalized && (
          <LoadingContent loading={isLoading} error={error}>
            {data && contact && (
              <ContactDetails
                key={contact.email}
                contact={contact}
                companies={data.companies}
                mutateContacts={() => mutate()}
              />
            )}
          </LoadingContent>
        )}
      </SheetContent>
    </Sheet>
  );
}

function emptyContact(email: string): ContactListItem {
  return {
    contactId: null,
    email,
    domain: emailDomain(email),
    name: null,
    title: null,
    phones: [],
    notes: null,
    aiSummary: null,
    photoUrl: null,
    useCompanyLogo: true,
    isPersonal: false,
    companyId: null,
    receivedCount: 0,
    sentCount: 0,
    lastInteractionAt: null,
    stale: false,
    isSaved: false,
    inboxPriority: "OFF",
    inboxPriorityInstructions: null,
  };
}
