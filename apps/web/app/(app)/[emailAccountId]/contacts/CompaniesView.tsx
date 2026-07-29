"use client";

import { type CSSProperties, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ChevronDownIcon, ChevronRightIcon, UserIcon } from "lucide-react";
import {
  type CompanySummary,
  contactDisplayName,
  contactKey,
  type ContactGroup,
  type ContactListItem,
  type DomainStat,
  groupContacts,
  resolveContactCompany,
} from "@/utils/contacts";
import { rollUpCompanyStats } from "@/utils/contacts-aggregates";
import { nameHue } from "@/utils/name-color";
import { cn } from "@/utils";
import { Badge } from "@/components/Badge";
import { ContactAvatar } from "./ContactsList";
import { useCompanyMembers } from "./useCompanyMembers";

export function CompaniesView({
  contacts,
  companies,
  domainStats,
  groupBy,
  labelFilter,
  search = "",
  sort,
  activeContactKey,
  activeGroupKey,
  onSelectContact,
  onSelectCompany,
}: {
  contacts: ContactListItem[];
  companies: CompanySummary[];
  // Full-history per-domain stats — the card must not show the loaded
  // window's counts (often 0) under a company that has people
  domainStats: DomainStat[];
  // "company": one flat list; "label": sectioned by label path
  groupBy: "company" | "label";
  // Restrict to companies under this label id
  labelFilter?: string | null;
  // The page's search term — `contacts` is already narrowed to matching
  // people server-side; this narrows the company/label rows themselves
  search?: string;
  sort: "recent" | "name" | "frequent";
  activeContactKey: string | null;
  activeGroupKey: string | null;
  onSelectContact: (contact: ContactListItem) => void;
  onSelectCompany: (key: string) => void;
}) {
  const term = search.trim().toLowerCase();

  // Only purposely-added companies (plus Personal) — auto domain groups live
  // in the Suggested view until the user adds or ignores them
  const groups = useMemo(() => {
    let all = groupContacts({ contacts, companies }).filter(
      (group) => group.company || group.key === "personal",
    );
    // A group survives the search when it still has matching people (the
    // server already narrowed `contacts`) or its own name/domains match — so
    // searching a person shows exactly the companies holding them
    if (term) {
      all = all.filter(
        (group) =>
          group.contacts.length > 0 ||
          group.name.toLowerCase().includes(term) ||
          group.domains.some((domain) => domain.includes(term)),
      );
    }
    if (!labelFilter) return all;
    return all.filter(
      (group) =>
        group.company?.label?.id === labelFilter ||
        group.company?.label?.parent?.id === labelFilter,
    );
  }, [contacts, companies, labelFilter, term]);

  // Cards carry their own stats, so sorting by recency or volume has to look
  // them up too — `groupContacts` only knows how to sort by name
  const sorted = useMemo(() => {
    const statsFor = (group: ContactGroup) =>
      rollUpCompanyStats({
        domains: group.domains,
        domainStats,
        members: group.contacts,
      });
    if (sort === "name") return groups;
    if (sort === "frequent") {
      return [...groups].sort(
        (a, b) => statsFor(b).emails - statsFor(a).emails,
      );
    }
    return [...groups].sort(
      (a, b) =>
        (statsFor(b).lastInteractionAt?.getTime() ?? 0) -
        (statsFor(a).lastInteractionAt?.getTime() ?? 0),
    );
  }, [groups, domainStats, sort]);

  // Label grouping sections by label path ("Factory" then "Factory › …"), then
  // unlabeled companies, then Personal; company grouping is one flat list
  const sections = useMemo(() => {
    if (groupBy === "company") {
      const personal = sorted.filter((group) => group.key === "personal");
      const rest = sorted.filter((group) => group.key !== "personal");
      return [
        ...(rest.length ? [{ title: "Companies", groups: rest }] : []),
        ...personal.map((group) => ({ title: group.name, groups: [group] })),
      ];
    }

    const byLabel = new Map<string, ContactGroup[]>();
    const unlabeled: ContactGroup[] = [];
    const special: ContactGroup[] = [];

    for (const group of sorted) {
      if (group.key === "personal") {
        special.push(group);
      } else if (group.company?.label) {
        const label = group.company.label;
        const path = label.parent
          ? `${label.parent.name} › ${label.name}`
          : label.name;
        byLabel.set(path, [...(byLabel.get(path) ?? []), group]);
      } else {
        unlabeled.push(group);
      }
    }

    return [
      ...[...byLabel.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([title, list]) => ({ title, groups: list })),
      ...(unlabeled.length ? [{ title: "Companies", groups: unlabeled }] : []),
      ...special.map((group) => ({ title: group.name, groups: [group] })),
    ];
  }, [sorted, groupBy]);

  // Saved people who belong to no curated company and aren't Personal —
  // without this section, imports (e.g. a Google pull) look like they
  // vanished, since this view only renders curated companies
  const unfiled = useMemo(
    () =>
      labelFilter
        ? []
        : contacts.filter(
            (contact) =>
              contact.isSaved &&
              !contact.isPersonal &&
              !resolveContactCompany(contact, companies),
          ),
    [contacts, companies, labelFilter],
  );

  if (!sections.length && !unfiled.length) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {term
          ? `No companies or people match “${search.trim()}”.`
          : "No companies yet. Check the Suggested tab to add them from the domains in your email, or use “Add contact” and set a company."}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <div key={section.title}>
          {/* One flat list needs no heading above it; label sections do */}
          {(groupBy === "label" || section.title !== "Companies") && (
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70">
              {section.title}
            </h3>
          )}
          <div className="space-y-2">
            {section.groups.map((group) => (
              <CompanyCard
                key={group.key}
                group={group}
                companies={companies}
                domainStats={domainStats}
                activeContactKey={activeContactKey}
                active={group.key === activeGroupKey}
                onSelectContact={onSelectContact}
                onSelectCompany={() => onSelectCompany(group.key)}
              />
            ))}
          </div>
        </div>
      ))}

      {unfiled.length > 0 && (
        <div>
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70">
            Unfiled ({unfiled.length})
          </h3>
          <div className="space-y-2">
            {unfiled.map((contact) => (
              <PersonCard
                key={contactKey(contact)}
                contact={contact}
                companies={companies}
                active={contactKey(contact) === activeContactKey}
                onSelect={() => onSelectContact(contact)}
              />
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Saved people without a company — open one to set a company or mark
            it personal.
          </p>
        </div>
      )}
    </div>
  );
}

function CompanyCard({
  group,
  companies,
  domainStats,
  activeContactKey,
  active,
  onSelectContact,
  onSelectCompany,
}: {
  group: ContactGroup;
  companies: CompanySummary[];
  domainStats: DomainStat[];
  activeContactKey: string | null;
  active: boolean;
  onSelectContact: (contact: ContactListItem) => void;
  onSelectCompany: () => void;
}) {
  const [open, setOpen] = useState(false);

  // The page's contact list is a recency window, so a company's people may not
  // be in it at all — fetch them on expand from the full history (the window's
  // members render instantly as a fallback meanwhile)
  const fetchedMembers = useCompanyMembers({
    domains: group.domains,
    companyId: group.company?.id,
    enabled: open && !!group.company,
  });
  const members = fetchedMembers.data ?? group.contacts;
  const membersLoading =
    open && !!group.company && !fetchedMembers.data && !fetchedMembers.error;

  const stats = rollUpCompanyStats({
    domains: group.domains,
    domainStats,
    members,
  });

  const isPersonal = group.key === "personal";
  const subtitle = [
    group.domains.join(", ") ||
      `${stats.people} ${stats.people === 1 ? "person" : "people"}`,
    stats.lastInteractionAt &&
      `last activity ${formatDistanceToNow(stats.lastInteractionAt, {
        addSuffix: true,
      })}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      // The hue drives the wash, border, and chip via globals.css
      style={{ "--company-hue": nameHue(group.name) } as CSSProperties}
      className={cn(
        "company-card overflow-hidden rounded-[10px] border",
        active && "border-primary/60",
      )}
    >
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={onSelectCompany}
        >
          <CompanyMark group={group} isPersonal={isPersonal} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">
              {group.name}
            </span>
            <span className="block truncate text-[13px] text-muted-foreground">
              {subtitle}
            </span>
          </span>
        </button>
        {group.company?.label && (
          <Badge color="blue">{group.company.label.name}</Badge>
        )}
        <span className="hidden shrink-0 text-right text-[13px] tabular-nums text-muted-foreground sm:block">
          {stats.people} {stats.people === 1 ? "person" : "people"}
        </span>
        <button
          type="button"
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setOpen(!open)}
        >
          <span className="sr-only">
            {open ? "Collapse people" : "Show people"}
          </span>
          {open ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronRightIcon className="size-4" />
          )}
        </button>
      </div>

      {open && (
        <div className="border-t border-border/60">
          {members.length ? (
            members.map((contact) => (
              <button
                key={contactKey(contact)}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2.5 border-b border-border/40 py-2 pl-4 pr-3.5 text-left last:border-b-0 hover:bg-muted/40 sm:pl-14",
                  contactKey(contact) === activeContactKey && "bg-muted/40",
                )}
                onClick={() => onSelectContact(contact)}
              >
                <ContactAvatar
                  contact={contact}
                  companies={companies}
                  className="size-7 shrink-0 rounded-full bg-muted object-cover p-0.5"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">
                    {contactDisplayName(contact)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[contact.title, contact.email].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <LastActivity contact={contact} />
              </button>
            ))
          ) : (
            <p className="px-3.5 py-2 text-sm text-muted-foreground">
              {membersLoading ? "Loading…" : "No contacts yet."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// The company's logo, or its initial on a tinted chip when no logo resolves.
// Personal is a group, not a company, so it gets the person glyph.
function CompanyMark({
  group,
  isPersonal,
}: {
  group: ContactGroup;
  isPersonal: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (isPersonal) {
    return (
      <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <UserIcon className="size-4" />
      </span>
    );
  }

  if (group.logoUrl && !failed) {
    return (
      // biome-ignore lint/performance/noImgElement: external logos, not build assets
      <img
        src={group.logoUrl}
        alt=""
        width={34}
        height={34}
        onError={() => setFailed(true)}
        className={cn(
          "size-[34px] shrink-0 rounded-lg object-cover p-0.5",
          group.company?.logoWhiteBackground ? "bg-white" : "bg-muted",
        )}
      />
    );
  }

  return (
    <span className="company-chip flex size-[34px] shrink-0 items-center justify-center rounded-lg text-[13px] font-bold">
      {group.name.charAt(0).toUpperCase()}
    </span>
  );
}

// A person as a standalone card — the People view's row, reused by Unfiled.
// The avatar prefers the company mark, so the list scans by organisation.
export function PersonCard({
  contact,
  companies,
  active,
  onSelect,
}: {
  contact: ContactListItem;
  companies: CompanySummary[];
  active: boolean;
  onSelect: () => void;
}) {
  const company = resolveContactCompany(contact, companies);
  // Title · organisation · address, so a row reads as a person at a place
  const subtitle = [
    contact.title,
    contact.isPersonal ? "Personal" : company?.name,
    contact.email,
  ]
    .filter(Boolean)
    .join(" · ");
  const volume = contact.receivedCount + contact.sentCount;

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-3 rounded-[10px] border border-border bg-card px-3.5 py-2.5 text-left hover:bg-muted/40",
        active && "border-primary/50",
      )}
      onClick={onSelect}
    >
      <ContactAvatar
        contact={contact}
        companies={companies}
        className="size-8 shrink-0 rounded-full bg-muted object-cover p-0.5"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-semibold">
            {contactDisplayName(contact)}
          </span>
          {contact.stale && <Badge color="yellow">Stale</Badge>}
        </span>
        <span className="block truncate text-[13px] text-muted-foreground">
          {subtitle}
        </span>
      </span>
      {volume > 0 && (
        <span className="hidden shrink-0 text-right text-[13px] tabular-nums text-muted-foreground sm:block">
          {volume}
        </span>
      )}
      <LastActivity contact={contact} className="sm:w-24" />
    </button>
  );
}

function LastActivity({
  contact,
  className,
}: {
  contact: ContactListItem;
  className?: string;
}) {
  if (!contact.lastInteractionAt) return null;

  return (
    <span
      className={cn(
        "shrink-0 truncate text-right text-[13px] text-muted-foreground",
        className,
      )}
    >
      {formatDistanceToNow(new Date(contact.lastInteractionAt), {
        addSuffix: true,
      })}
    </span>
  );
}
