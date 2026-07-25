"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useAction } from "next-safe-action/hooks";
import { formatDistanceToNow } from "date-fns";
import { CheckIcon, MailIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import {
  type CompanySummary,
  companyOwningDomain,
  type ContactGroup,
  type ContactListItem,
  type DomainStat,
  resolveContactCompany,
} from "@/utils/contacts";
import {
  deleteContactAction,
  enrichContactAction,
  updateContactAction,
} from "@/utils/actions/contact";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useThreads } from "@/hooks/useThreads";
import { prefixPath } from "@/utils/path";
import { getActionErrorMessage } from "@/utils/error";
import { toastError, toastSuccess } from "@/components/Toast";
import { LoadingContent } from "@/components/LoadingContent";
import { EmailList } from "@/components/email-list/EmailList";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ContactAvatar } from "./ContactsList";
import { CompanyDetails } from "./CompanyDetails";

// On narrow screens this sheet stands in for the persistent detail pane —
// showing either a contact or a company
export function ContactDetailSheet({
  contact,
  group,
  companies,
  domainStats,
  onClose,
  onSelectContact,
  mutateContacts,
}: {
  contact: ContactListItem | null;
  group: ContactGroup | null;
  companies: CompanySummary[];
  domainStats: DomainStat[];
  onClose: () => void;
  onSelectContact: (contact: ContactListItem) => void;
  mutateContacts: () => void;
}) {
  return (
    <Sheet
      open={!!contact || !!group}
      onOpenChange={(open) => !open && onClose()}
    >
      <SheetContent side="right" className="overflow-y-auto sm:max-w-xl">
        <SheetTitle className="sr-only">Details</SheetTitle>
        {group ? (
          <CompanyDetails
            key={group.key}
            group={group}
            companies={companies}
            domainStats={domainStats}
            onSelectContact={onSelectContact}
            mutateContacts={mutateContacts}
            onDeleted={onClose}
          />
        ) : contact ? (
          <ContactDetails
            key={contact.email}
            contact={contact}
            companies={companies}
            mutateContacts={mutateContacts}
            onDeleted={onClose}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

// Also rendered inline as the persistent right pane on wide screens
export function ContactDetails({
  contact,
  companies,
  mutateContacts,
  onDeleted,
}: {
  contact: ContactListItem;
  companies: CompanySummary[];
  mutateContacts: () => void;
  // The mobile sheet closes on delete; the wide pane keeps showing the
  // (now unsaved) contact and omits this
  onDeleted?: () => void;
}) {
  const { emailAccountId } = useAccount();
  const company = resolveContactCompany(contact, companies);
  // Domain-owned membership is authoritative, so when it applies both the
  // displayed value and the lock must name the same company
  const lockedCompany = companyOwningDomain(contact.domain, companies);

  // Remount the edit form only when the saved row disappears (deleted here
  // or by a synced client) so cleared fields don't linger. Keying on isSaved
  // itself would also fire when enrichment saves a summary (unsaved → saved)
  // and wipe the suggestions panel mid-flow.
  const [formEpoch, setFormEpoch] = useState(0);
  const wasSaved = useRef(contact.isSaved);
  useEffect(() => {
    if (wasSaved.current && !contact.isSaved) setFormEpoch((n) => n + 1);
    wasSaved.current = contact.isSaved;
  }, [contact.isSaved]);

  const deleteContact = useAction(
    deleteContactAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Contact deleted" });
        mutateContacts();
        onDeleted?.();
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ContactAvatar
          contact={contact}
          companies={companies}
          className="size-10 shrink-0 rounded-full bg-muted object-cover p-0.5"
        />
        <div className="min-w-0">
          <h2 className="truncate font-display text-2xl tracking-tight">
            {contact.name || contact.email}
          </h2>
          <p className="truncate text-sm text-muted-foreground">
            {[contact.title, company?.name, contact.email]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>{contact.receivedCount} received</span>
        <span>{contact.sentCount} sent</span>
        {contact.lastInteractionAt && (
          <span>
            Last activity{" "}
            {formatDistanceToNow(new Date(contact.lastInteractionAt), {
              addSuffix: true,
            })}
          </span>
        )}
        {contact.stale && <Badge color="yellow">Stale</Badge>}
      </div>

      <div className="rounded-lg border border-border p-4">
        <h3 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70">
          <SparklesIcon className="size-3 text-primary" />
          Relationship summary
        </h3>
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
          {contact.aiSummary ??
            "No summary yet — use “Suggest from emails” below and the AI will write one from your email history."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link
            href={prefixPath(
              emailAccountId,
              `/mail?q=${encodeURIComponent(contact.email)}`,
            )}
          >
            <MailIcon className="mr-1.5 size-3.5" />
            Search in Mail
          </Link>
        </Button>
        {contact.isSaved && (
          <Button
            variant="destructiveSoft"
            size="sm"
            loading={deleteContact.isExecuting}
            onClick={() => {
              const yes = confirm(
                "Delete this contact's saved details (and their Google Contacts entry when sync is on)? They'll still appear in the list while you have email history together.",
              );
              if (yes) deleteContact.execute({ email: contact.email });
            }}
          >
            <Trash2Icon className="mr-1.5 size-3.5" />
            Delete
          </Button>
        )}
      </div>

      <ContactEditForm
        key={formEpoch}
        contact={contact}
        // Locked contacts show the owning company; the field then locks so
        // one person's edit can't diverge from (or hijack) the domain's
        // company
        companyName={(lockedCompany ?? company)?.name ?? ""}
        lockedCompanyName={lockedCompany?.name ?? null}
        mutateContacts={mutateContacts}
      />

      <RecentEmails email={contact.email} />
    </div>
  );
}

type Suggestion = {
  field: "name" | "title" | "companyName" | "phone";
  label: string;
  value: string;
};

function ContactEditForm({
  contact,
  companyName,
  lockedCompanyName,
  mutateContacts,
}: {
  contact: ContactListItem;
  companyName: string;
  // Set when a company owns the contact's email domain — the company
  // field is read-only then (change the company's domains instead)
  lockedCompanyName: string | null;
  mutateContacts: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [isPersonal, setIsPersonal] = useState(contact.isPersonal);
  const [useCompanyLogo, setUseCompanyLogo] = useState(contact.useCompanyLogo);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const { register, handleSubmit, setValue } = useForm<{
    name: string;
    title: string;
    phone: string;
    companyName: string;
    photoUrl: string;
    notes: string;
  }>({
    defaultValues: {
      name: contact.name ?? "",
      title: contact.title ?? "",
      phone: contact.phone ?? "",
      companyName,
      photoUrl: contact.photoUrl ?? "",
      notes: contact.notes ?? "",
    },
  });

  const update = useAction(updateContactAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Contact saved" });
      mutateContacts();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  const enrich = useAction(enrichContactAction.bind(null, emailAccountId), {
    onSuccess: (result) => {
      if (!result.data) return;
      const { name, title, company, phones } = result.data.suggestions;
      const found: Suggestion[] = [
        ...(name
          ? [{ field: "name" as const, label: "Name", value: name }]
          : []),
        ...(title
          ? [{ field: "title" as const, label: "Title", value: title }]
          : []),
        // Domain-owned membership can't be edited per contact, so a company
        // suggestion would only lead to a rejected save
        ...(company && !lockedCompanyName
          ? [
              {
                field: "companyName" as const,
                label: "Company",
                value: company,
              },
            ]
          : []),
        ...phones.map((phone) => ({
          field: "phone" as const,
          label: "Phone",
          value: phone,
        })),
      ];
      setSuggestions(found);
      // The relationship summary was saved server-side — refresh to show it
      mutateContacts();
      if (!found.length) {
        toastSuccess({
          description: "Summary updated. No new details found in their emails.",
        });
      }
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit((values) =>
        update.execute({
          email: contact.email,
          name: values.name,
          title: values.title,
          phone: values.phone,
          // The form keeps a value even when the input is disabled — omit
          // it so saving other fields can't trip the server's domain lock
          companyName:
            isPersonal || lockedCompanyName ? undefined : values.companyName,
          photoUrl: values.photoUrl.trim(),
          notes: values.notes,
          isPersonal,
          useCompanyLogo,
        }),
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Details</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={enrich.isExecuting}
          onClick={() => enrich.execute({ email: contact.email })}
        >
          <SparklesIcon className="mr-1.5 size-3.5" />
          Suggest from emails
        </Button>
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-sm font-medium">Found in their emails</p>
          {suggestions.map((suggestion) => (
            <div
              key={`${suggestion.field}-${suggestion.value}`}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="min-w-0 truncate text-muted-foreground">
                {suggestion.label}:{" "}
                <span className="text-foreground">{suggestion.value}</span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  setValue(suggestion.field, suggestion.value, {
                    shouldDirty: true,
                  });
                  setSuggestions((prev) =>
                    prev.filter((s) => s !== suggestion),
                  );
                }}
              >
                <CheckIcon className="mr-1 size-3" />
                Apply
              </Button>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Apply the ones that look right, then save.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="contact-name">Name</Label>
          <Input id="contact-name" className="mt-2" {...register("name")} />
        </div>
        <div>
          <Label htmlFor="contact-title">Title</Label>
          <Input
            id="contact-title"
            className="mt-2"
            placeholder="e.g. Plant Manager"
            {...register("title")}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="contact-company">Company</Label>
          <Input
            id="contact-company"
            className="mt-2"
            disabled={isPersonal || !!lockedCompanyName}
            placeholder="Where they work"
            {...register("companyName")}
          />
          {lockedCompanyName && !isPersonal && (
            <p className="mt-1 text-xs text-muted-foreground">
              Set automatically — {lockedCompanyName} owns @{contact.domain}.
              Edit the company's domains to change it.
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="contact-phone">Phone</Label>
          <Input id="contact-phone" className="mt-2" {...register("phone")} />
        </div>
      </div>
      <div>
        <Label htmlFor="contact-photo">Photo URL</Label>
        <Input
          id="contact-photo"
          className="mt-2"
          placeholder="https://…"
          {...register("photoUrl")}
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="contact-personal">Personal contact</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Grouped under Personal instead of a company.
          </p>
        </div>
        <Switch
          id="contact-personal"
          checked={isPersonal}
          onCheckedChange={setIsPersonal}
        />
      </div>
      {!isPersonal && (
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="contact-company-logo">Use company logo</Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Off shows their personal photo instead.
            </p>
          </div>
          <Switch
            id="contact-company-logo"
            checked={useCompanyLogo}
            onCheckedChange={setUseCompanyLogo}
          />
        </div>
      )}
      <div>
        <Label htmlFor="contact-notes">Notes</Label>
        <Textarea
          id="contact-notes"
          className="mt-2"
          rows={4}
          placeholder="Anything worth remembering about this person"
          {...register("notes")}
        />
      </div>
      {/* Anchored so Save stays reachable while the pane scrolls */}
      <div className="sticky bottom-0 border-t border-border bg-background py-3">
        <Button type="submit" size="sm" loading={update.isExecuting}>
          Save
        </Button>
      </div>
    </form>
  );
}

function RecentEmails({ email }: { email: string }) {
  const { data, isLoading, error, mutate } = useThreads({
    fromEmail: email,
    type: "all",
    limit: 10,
  });

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">Recent emails</h3>
      <LoadingContent loading={isLoading} error={error}>
        {data && (
          <EmailList
            threads={data.threads}
            emptyMessage={
              <p className="py-4 text-sm text-muted-foreground">
                No emails from this contact.
              </p>
            }
            hideActionBarWhenEmpty
            refetch={() => mutate()}
          />
        )}
      </LoadingContent>
    </div>
  );
}
