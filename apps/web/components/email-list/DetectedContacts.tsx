"use client";

import { useMemo, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { CheckIcon, SparklesIcon, UserPlusIcon, XIcon } from "lucide-react";
import type { ParsedMessage } from "@/utils/types";
import {
  extractContactsFromEmailAction,
  updateContactAction,
} from "@/utils/actions/contact";
import { useAccount } from "@/providers/EmailAccountProvider";
import { extractEmailAddresses } from "@/utils/email";
import { getActionErrorMessage } from "@/utils/error";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";

type DetectedPerson = {
  name: string | null;
  email: string;
  title: string | null;
  phones: { label: string; value: string }[];
  companyName: string | null;
  alreadySaved: boolean;
};

const MAX_CONTENT = 20_000;

// "443-391-9713", "(443) 391-9713", "+1 443.391.9713" — a body that pairs
// addresses with phone numbers reads as contact info worth extracting
const PHONE_PATTERN =
  /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}/;

// When an email's body carries other people's addresses (a roster, an
// intro, forwarded signatures), a chip overlays the message; extracting
// runs the AI and turns it into an add-as-contact card.
export function DetectedContacts({ message }: { message: ParsedMessage }) {
  const { emailAccountId, userEmail } = useAccount();
  const [dismissed, setDismissed] = useState(false);
  const [people, setPeople] = useState<DetectedPerson[] | null>(null);

  // Free gate: offer extraction when the BODY mentions addresses beyond the
  // conversation's participants — or the participants themselves when the
  // body pairs addresses with phone numbers (a roster of people who are
  // also CC'd is the classic case; the extraction captures the phones and
  // titles the headers don't carry). The user's own address never counts.
  const candidates = useMemo(() => {
    const text = getMessageText(message);
    if (!text) return [];
    const participants = new Set(
      [
        ...extractEmailAddresses(message.headers.from ?? ""),
        ...extractEmailAddresses(message.headers.to ?? ""),
        ...extractEmailAddresses(message.headers.cc ?? ""),
      ]
        .filter(Boolean)
        .map((email) => email.toLowerCase()),
    );
    const ownEmail = userEmail?.toLowerCase();
    const hasPhoneNumbers = PHONE_PATTERN.test(text);
    return [
      ...new Set(
        extractEmailAddresses(text).map((email) => email.toLowerCase()),
      ),
    ]
      .filter((email) => email !== ownEmail)
      .filter((email) => hasPhoneNumbers || !participants.has(email));
  }, [message, userEmail]);

  const extract = useAction(
    extractContactsFromEmailAction.bind(null, emailAccountId),
    {
      onSuccess: (result) => {
        const found = result.data?.people ?? [];
        if (!found.length) {
          toastSuccess({
            description: "No addable people found in this email.",
          });
          setDismissed(true);
          return;
        }
        setPeople(found);
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  if (dismissed || !candidates.length) return null;

  if (!people) {
    return (
      <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <SparklesIcon className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 truncate">
            This email mentions {candidates.length}{" "}
            {candidates.length === 1 ? "person" : "people"} you could add to
            contacts.
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="outline"
            size="xs"
            loading={extract.isExecuting}
            onClick={() =>
              extract.execute({
                from: message.headers.from ?? "",
                subject: message.headers.subject ?? "",
                content: (getMessageText(message) ?? "").slice(0, MAX_CONTENT),
              })
            }
          >
            Extract contacts
          </Button>
          <Button
            variant="ghost"
            size="iconSm"
            onClick={() => setDismissed(true)}
          >
            <span className="sr-only">Dismiss</span>
            <XIcon className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <DetectedContactsCard
      people={people}
      onUpdatePerson={(email, patch) =>
        setPeople(
          (previous) =>
            previous?.map((person) =>
              person.email === email ? { ...person, ...patch } : person,
            ) ?? null,
        )
      }
      onClose={() => setDismissed(true)}
    />
  );
}

function DetectedContactsCard({
  people,
  onUpdatePerson,
  onClose,
}: {
  people: DetectedPerson[];
  onUpdatePerson: (email: string, patch: Partial<DetectedPerson>) => void;
  onClose: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [addingAll, setAddingAll] = useState(false);
  const [addingEmail, setAddingEmail] = useState<string | null>(null);

  const addPerson = async (person: DetectedPerson) => {
    const result = await updateContactAction(emailAccountId, {
      email: person.email,
      name: person.name ?? undefined,
      title: person.title ?? undefined,
      phones: person.phones.length ? person.phones : undefined,
      companyName: person.companyName ?? undefined,
    });
    if (result?.serverError || result?.validationErrors) {
      throw new Error(result.serverError ?? "Couldn't save the contact");
    }
  };

  const addOne = async (person: DetectedPerson) => {
    setAddingEmail(person.email);
    try {
      await addPerson(person);
      onUpdatePerson(person.email, { alreadySaved: true });
      toastSuccess({
        description: `${person.name || person.email} added to contacts`,
      });
    } catch (error) {
      toastError({
        description:
          error instanceof Error ? error.message : "Couldn't save the contact",
      });
    } finally {
      setAddingEmail(null);
    }
  };

  const addAll = async () => {
    setAddingAll(true);
    let added = 0;
    let failed = 0;
    for (const person of people) {
      if (person.alreadySaved) continue;
      try {
        await addPerson(person);
        onUpdatePerson(person.email, { alreadySaved: true });
        added++;
      } catch {
        failed++;
      }
    }
    setAddingAll(false);
    if (failed) {
      toastError({
        description: `Added ${added}; ${failed} couldn't be saved.`,
      });
    } else {
      toastSuccess({ description: `Added ${added} to contacts` });
    }
  };

  const remaining = people.filter((person) => !person.alreadySaved).length;

  return (
    <div className="mt-3 rounded-lg border border-primary/40">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70">
          <SparklesIcon className="size-3 text-primary" />
          People in this email
        </h3>
        <div className="flex items-center gap-1">
          {remaining > 1 && (
            <Button
              variant="outline"
              size="xs"
              loading={addingAll}
              onClick={addAll}
            >
              <UserPlusIcon className="mr-1 size-3" />
              Add all ({remaining})
            </Button>
          )}
          <Button variant="ghost" size="iconSm" onClick={onClose}>
            <span className="sr-only">Close</span>
            <XIcon className="size-4" />
          </Button>
        </div>
      </div>
      <div className="divide-y divide-border">
        {people.map((person) => (
          <div
            key={person.email}
            className="flex items-center gap-3 px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {person.name || person.email}
              </div>
              <div className="truncate text-sm text-muted-foreground">
                {[
                  person.name ? person.email : null,
                  person.title,
                  person.companyName,
                  ...person.phones.map((phone) => phone.value),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            {person.alreadySaved ? (
              <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                <CheckIcon className="size-3.5" />
                Saved
              </span>
            ) : (
              <Button
                variant="outline"
                size="xs"
                className="shrink-0"
                loading={addingEmail === person.email}
                disabled={addingAll}
                onClick={() => addOne(person)}
              >
                <UserPlusIcon className="mr-1 size-3" />
                Add
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// The plain text of the message body; HTML mails get their tags stripped —
// fine for both the mention gate and the AI prompt
function getMessageText(message: ParsedMessage): string | null {
  if (message.textPlain?.trim()) return message.textPlain;
  if (message.textHtml) {
    return message.textHtml
      .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">");
  }
  return null;
}
