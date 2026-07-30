"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useAction } from "next-safe-action/hooks";
import {
  CheckIcon,
  EyeOffIcon,
  InboxIcon,
  MailIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import {
  type CompanySummary,
  companyOwningDomain,
  contactDisplayName,
  contactKey,
  type ContactGroup,
  type ContactListItem,
  type DomainStat,
  type LabelSummary,
  resolveContactCompany,
} from "@/utils/contacts";
import {
  deleteContactAction,
  enrichContactAction,
  setContactIgnoredAction,
  setContactInboxPriorityAction,
  updateContactAction,
} from "@/utils/actions/contact";
import { ContactInboxPriority } from "@/generated/prisma/enums";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ContactAvatar } from "./ContactsList";
import { CompanyDetails } from "./CompanyDetails";
import {
  LatestThreadCard,
  PaneCard,
  PaneSectionTitle,
  PaneShell,
} from "./PaneChrome";

// The detail pane is a drawer at every width — showing either a contact or a
// company. On wide screens it slides in over the list rather than splitting it.
export function ContactDetailSheet({
  contact,
  group,
  companies,
  labels,
  domainStats,
  onClose,
  onSelectContact,
  mutateContacts,
}: {
  contact: ContactListItem | null;
  group: ContactGroup | null;
  companies: CompanySummary[];
  labels: LabelSummary[];
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
      <SheetContent
        side="right"
        // The close X is the only way out of the full-screen mobile pane;
        // grow its hit area without changing the visual
        className="w-full max-w-none p-5 sm:max-w-[560px] [&>button]:top-6 [&>button]:p-2.5 [&>button]:-m-2.5"
      >
        <SheetTitle className="sr-only">Details</SheetTitle>
        {group ? (
          <CompanyDetails
            key={group.key}
            group={group}
            companies={companies}
            labels={labels}
            domainStats={domainStats}
            onSelectContact={onSelectContact}
            mutateContacts={mutateContacts}
            onDeleted={onClose}
          />
        ) : contact ? (
          <ContactDetails
            key={contactKey(contact)}
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

const CONTACT_TABS = [
  { key: "overview", label: "Overview" },
  { key: "details", label: "Details" },
  { key: "emails", label: "Emails" },
  { key: "options", label: "Options" },
];

type Suggestion = {
  field: "name" | "title" | "companyName" | "phone";
  label: string;
  value: string;
  // For phone suggestions: the kind of line ("Mobile", "Work", …)
  phoneLabel?: string;
};

export function ContactDetails({
  contact,
  companies,
  mutateContacts,
  onDeleted,
}: {
  contact: ContactListItem;
  companies: CompanySummary[];
  mutateContacts: () => void;
  onDeleted: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [tab, setTab] = useState("overview");
  // Enrichment runs from Overview but its chips are applied in the Details
  // form, so the results live here and the run switches tabs
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  // Bound locally so the email-only affordances below narrow inside their
  // callbacks — a phone-only contact has no address
  const email = contact.email;
  const company = resolveContactCompany(contact, companies);
  // Domain-owned membership is authoritative, so when it applies both the
  // displayed value and the lock must name the same company
  const lockedCompany = companyOwningDomain(contact.domain, companies);

  // Shared by the Overview's latest thread and the Emails tab — same SWR key,
  // so opening the drawer costs one request either way
  const threads = useThreads({
    fromEmail: email ?? undefined,
    type: "all",
    limit: 10,
  });
  const latest = threads.data?.threads[0];
  const latestMessage = latest?.messages.at(-1);

  const deleteContact = useAction(
    deleteContactAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Contact deleted" });
        mutateContacts();
        onDeleted();
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  const ignoreContact = useAction(
    setContactIgnoredAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({
          description:
            "Ignored — it won't appear in contacts again. Restore it anytime from the Suggested tab.",
        });
        mutateContacts();
        onDeleted();
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  const enrich = useAction(enrichContactAction.bind(null, emailAccountId), {
    onSuccess: (result) => {
      if (!result.data) return;
      const {
        name,
        title,
        company: suggestedCompany,
        phones,
      } = result.data.suggestions;
      const found: Suggestion[] = [];
      if (name) found.push({ field: "name", label: "Name", value: name });
      if (title) found.push({ field: "title", label: "Title", value: title });
      // Domain-owned membership can't be edited per contact, so a company
      // suggestion would only lead to a rejected save
      if (suggestedCompany && !lockedCompany) {
        found.push({
          field: "companyName",
          label: "Company",
          value: suggestedCompany,
        });
      }
      for (const phone of phones) {
        found.push({
          field: "phone",
          label:
            phone.label && phone.label !== "Other"
              ? `Phone (${phone.label})`
              : "Phone",
          value: phone.value,
          phoneLabel: phone.label || "Other",
        });
      }
      setSuggestions(found);
      // The relationship summary was saved server-side — refresh to show it
      mutateContacts();
      if (found.length) {
        setTab("details");
      } else {
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
    <PaneShell
      mark={
        <ContactAvatar
          contact={contact}
          companies={companies}
          className="size-[52px] shrink-0 rounded-full bg-muted object-cover p-1"
        />
      }
      title={contactDisplayName(contact)}
      subtitle={
        [contact.title, company?.name, contact.email]
          .filter(Boolean)
          .join(" · ") || "No details yet"
      }
      actions={
        email && (
          <Button asChild variant="outline" size="icon" title="Search in Mail">
            <Link
              href={prefixPath(
                emailAccountId,
                `/mail?q=${encodeURIComponent(email)}`,
              )}
            >
              <MailIcon className="size-4" />
              <span className="sr-only">Search in Mail</span>
            </Link>
          </Button>
        )
      }
      stats={[
        {
          value: contact.receivedCount + contact.sentCount,
          label: "emails",
        },
        { value: contact.receivedCount, label: "received" },
        { value: contact.sentCount, label: "sent" },
      ]}
      lastInteractionAt={
        contact.lastInteractionAt ? new Date(contact.lastInteractionAt) : null
      }
      tabs={CONTACT_TABS}
      activeTab={tab}
      onTabChange={setTab}
    >
      {tab === "overview" && (
        <>
          {contact.stale && (
            <div>
              <Badge color="yellow">
                Stale — no email either way in months
              </Badge>
            </div>
          )}
          <PaneCard>
            <div className="flex items-center justify-between gap-2">
              <PaneSectionTitle>
                <SparklesIcon className="size-3 text-primary" />
                Relationship summary
              </PaneSectionTitle>
              {email && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-primary"
                  loading={enrich.isExecuting}
                  onClick={() => enrich.execute({ email })}
                >
                  Suggest from emails
                </Button>
              )}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-muted-foreground">
              {contact.aiSummary ??
                "No summary yet — “Suggest from emails” has the AI write one from your email history."}
            </p>
          </PaneCard>
          {email && (
            <LatestThreadCard
              subject={latestMessage?.headers.subject ?? null}
              date={
                latestMessage?.headers.date
                  ? new Date(latestMessage.headers.date)
                  : null
              }
              href={prefixPath(
                emailAccountId,
                `/mail?q=${encodeURIComponent(email)}`,
              )}
            />
          )}
        </>
      )}

      {tab === "details" && (
        <ContactEditForm
          contact={contact}
          companies={companies}
          // Locked contacts show the owning company; the field then locks so
          // one person's edit can't diverge from (or hijack) the domain's
          // company
          companyName={(lockedCompany ?? company)?.name ?? ""}
          lockedCompanyName={lockedCompany?.name ?? null}
          suggestions={suggestions}
          setSuggestions={setSuggestions}
          mutateContacts={mutateContacts}
        />
      )}

      {tab === "emails" &&
        (email ? (
          <>
            <LoadingContent loading={threads.isLoading} error={threads.error}>
              {threads.data && (
                <EmailList
                  threads={threads.data.threads}
                  emptyMessage={
                    <p className="py-4 text-sm text-muted-foreground">
                      No emails from this contact.
                    </p>
                  }
                  hideActionBarWhenEmpty
                  refetch={() => threads.mutate()}
                />
              )}
            </LoadingContent>
            <Link
              href={prefixPath(
                emailAccountId,
                `/mail?q=${encodeURIComponent(email)}`,
              )}
              className="text-[12.5px] font-medium text-primary hover:underline"
            >
              Search in Mail →
            </Link>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            This contact has no email address, so there's no mail history to
            show.
          </p>
        ))}

      {tab === "options" && (
        <>
          {email && (
            <InboxPrioritySection
              contact={contact}
              email={email}
              mutateContacts={mutateContacts}
            />
          )}
          {email && (
            <PaneCard className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[13px] font-medium">
                  Ignore this contact
                </div>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                  They won't appear in contacts again. Restore anytime from
                  Suggested.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                loading={ignoreContact.isExecuting}
                onClick={() => ignoreContact.execute({ email, ignored: true })}
              >
                <EyeOffIcon className="mr-1.5 size-3.5" />
                Ignore
              </Button>
            </PaneCard>
          )}
          {contact.isSaved && (
            <div className="flex items-center justify-between gap-4 rounded-[10px] border border-destructive/40 p-3.5">
              <div>
                <div className="text-[13px] font-medium">Delete contact</div>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                  Removes their saved details (and their Google Contacts entry
                  when sync is on). They'll still appear while you share email
                  history.
                </p>
              </div>
              <Button
                variant="destructiveSoft"
                size="sm"
                className="shrink-0"
                loading={deleteContact.isExecuting}
                onClick={() => {
                  if (confirm("Delete this contact's saved details?")) {
                    deleteContact.execute({
                      contactId: contact.contactId,
                      email: contact.email,
                    });
                  }
                }}
              >
                <Trash2Icon className="mr-1.5 size-3.5" />
                Delete
              </Button>
            </div>
          )}
        </>
      )}
    </PaneShell>
  );
}

// Per-sender override of the mail rules. OFF/ALWAYS save on selection; AI
// waits for instructions so a half-configured override never goes live.
function InboxPrioritySection({
  contact,
  email,
  mutateContacts,
}: {
  contact: ContactListItem;
  email: string;
  mutateContacts: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [priority, setPriority] = useState<ContactInboxPriority>(
    contact.inboxPriority,
  );
  const [instructions, setInstructions] = useState(
    contact.inboxPriorityInstructions ?? "",
  );

  const update = useAction(
    setContactInboxPriorityAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Inbox priority saved" });
        mutateContacts();
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  const aiUnsaved =
    priority === ContactInboxPriority.AI &&
    (contact.inboxPriority !== ContactInboxPriority.AI ||
      instructions.trim() !== (contact.inboxPriorityInstructions ?? "").trim());

  return (
    <PaneCard>
      <PaneSectionTitle>
        <InboxIcon className="size-3 text-primary" />
        Inbox priority
      </PaneSectionTitle>
      <div className="mt-3">
        <Select
          value={priority}
          onValueChange={(value) => {
            const next = value as ContactInboxPriority;
            setPriority(next);
            // AI needs instructions before it can go live — save on the
            // button below instead
            if (next !== ContactInboxPriority.AI) {
              update.execute({ email, priority: next });
            }
          }}
        >
          <SelectTrigger disabled={update.isExecuting}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ContactInboxPriority.OFF}>
              Normal — rules decide
            </SelectItem>
            <SelectItem value={ContactInboxPriority.ALWAYS}>
              Always keep in inbox
            </SelectItem>
            <SelectItem value={ContactInboxPriority.AI}>
              AI decides per email
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="mt-2 text-[12.5px] text-muted-foreground">
          {priority === ContactInboxPriority.OFF &&
            "Their email follows your normal rules."}
          {priority === ContactInboxPriority.ALWAYS &&
            "Every email from them stays in the inbox — no rule can move it."}
          {priority === ContactInboxPriority.AI &&
            "Emails matching your instructions stay in the inbox; the rest follow your normal rules."}
        </p>
      </div>
      {priority === ContactInboxPriority.AI && (
        <div className="mt-3 space-y-2">
          <Label htmlFor="inbox-priority-instructions">Instructions</Label>
          <Textarea
            id="inbox-priority-instructions"
            rows={3}
            placeholder="e.g. Keep it in my inbox when they mention me by name or ask me a direct question"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
          <Button
            size="sm"
            loading={update.isExecuting}
            disabled={!instructions.trim() || !aiUnsaved}
            onClick={() =>
              update.execute({
                email,
                priority: ContactInboxPriority.AI,
                instructions: instructions.trim(),
              })
            }
          >
            Save instructions
          </Button>
        </div>
      )}
    </PaneCard>
  );
}

// Label datalist options for a phone row; free text is fine too
const PHONE_LABELS = ["Mobile", "Work", "Home", "Main", "Fax", "Other"];

function ContactEditForm({
  contact,
  companies,
  companyName,
  lockedCompanyName,
  suggestions,
  setSuggestions,
  mutateContacts,
}: {
  contact: ContactListItem;
  // Existing companies feed the company field's type-ahead
  companies: CompanySummary[];
  companyName: string;
  // Set when a company owns the contact's email domain — the company field is
  // read-only then (change the company's domains instead)
  lockedCompanyName: string | null;
  suggestions: Suggestion[];
  setSuggestions: (update: (previous: Suggestion[]) => Suggestion[]) => void;
  mutateContacts: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [isPersonal, setIsPersonal] = useState(contact.isPersonal);
  const [useCompanyLogo, setUseCompanyLogo] = useState(contact.useCompanyLogo);

  // Remount the form only when the saved row disappears (deleted here or by a
  // synced client) so cleared fields don't linger. Keying on isSaved itself
  // would also fire when enrichment saves a summary (unsaved → saved).
  const [formEpoch, setFormEpoch] = useState(0);
  const wasSaved = useRef(contact.isSaved);
  useEffect(() => {
    if (wasSaved.current && !contact.isSaved) setFormEpoch((n) => n + 1);
    wasSaved.current = contact.isSaved;
  }, [contact.isSaved]);

  const { register, handleSubmit, setValue, control } = useForm<{
    name: string;
    title: string;
    phones: { label: string; value: string }[];
    companyName: string;
    photoUrl: string;
    notes: string;
  }>({
    defaultValues: {
      name: contact.name ?? "",
      title: contact.title ?? "",
      phones: contact.phones,
      companyName,
      photoUrl: contact.photoUrl ?? "",
      notes: contact.notes ?? "",
    },
  });
  const phoneRows = useFieldArray({ control, name: "phones" });

  const update = useAction(updateContactAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Contact saved" });
      mutateContacts();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  return (
    <form
      key={formEpoch}
      className="space-y-4"
      onSubmit={handleSubmit((values) =>
        update.execute({
          contactId: contact.contactId,
          email: contact.email,
          name: values.name,
          title: values.title,
          phones: values.phones,
          // The form keeps a value even when the input is disabled — omit it
          // so saving other fields can't trip the server's domain lock
          companyName:
            isPersonal || lockedCompanyName ? undefined : values.companyName,
          photoUrl: values.photoUrl.trim(),
          notes: values.notes,
          isPersonal,
          useCompanyLogo,
        }),
      )}
    >
      {suggestions.length > 0 && (
        <PaneCard className="space-y-2">
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
                  if (suggestion.field === "phone") {
                    phoneRows.append({
                      label: suggestion.phoneLabel ?? "Other",
                      value: suggestion.value,
                    });
                  } else {
                    setValue(suggestion.field, suggestion.value, {
                      shouldDirty: true,
                    });
                  }
                  setSuggestions((previous) =>
                    previous.filter((entry) => entry !== suggestion),
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
        </PaneCard>
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
            placeholder="Pick a company or type a new one"
            list="contact-company-options"
            {...register("companyName")}
          />
          {/* Type-ahead of existing companies; assigning one also adopts this
              contact's email domain onto it, grouping their whole domain under
              the company. Free text creates a new company. */}
          <datalist id="contact-company-options">
            {companies.map((option) => (
              <option key={option.id} value={option.name} />
            ))}
          </datalist>
          {lockedCompanyName && !isPersonal && (
            <p className="mt-1 text-xs text-muted-foreground">
              Set automatically — {lockedCompanyName} owns @{contact.domain}.
              Edit the company's domains to change it.
            </p>
          )}
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
      </div>
      <div>
        <Label>Phone numbers</Label>
        {phoneRows.fields.map((field, index) => (
          <div key={field.id} className="mt-2 flex gap-2">
            <Input
              className="w-28 shrink-0"
              placeholder="Label"
              list="contact-phone-labels"
              aria-label="Phone label"
              {...register(`phones.${index}.label`)}
            />
            <Input
              className="min-w-0 flex-1"
              placeholder="+1 555 010 0000"
              aria-label="Phone number"
              {...register(`phones.${index}.value`)}
            />
            <Button
              type="button"
              variant="ghost"
              size="iconSm"
              className="shrink-0"
              onClick={() => phoneRows.remove(index)}
            >
              <span className="sr-only">Remove phone</span>
              <XIcon className="size-4" />
            </Button>
          </div>
        ))}
        <datalist id="contact-phone-labels">
          {PHONE_LABELS.map((label) => (
            <option key={label} value={label} />
          ))}
        </datalist>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => phoneRows.append({ label: "Mobile", value: "" })}
        >
          <PlusIcon className="mr-1.5 size-3.5" />
          Add phone
        </Button>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="contact-personal">Personal contact</Label>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
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
            <p className="mt-1 text-[12.5px] text-muted-foreground">
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
