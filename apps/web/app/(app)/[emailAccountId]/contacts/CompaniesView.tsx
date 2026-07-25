"use client";

import { useMemo, useState } from "react";
import {
  BuildingIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  UserIcon,
} from "lucide-react";
import {
  type CompanySummary,
  type ContactGroup,
  type ContactListItem,
  type DomainStat,
  groupContacts,
} from "@/utils/contacts";
import { cn } from "@/utils";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/ui/button";
import { ContactAvatar } from "./ContactsList";
import { useCompanyMembers } from "./useCompanyMembers";

export function CompaniesView({
  contacts,
  companies,
  domainStats,
  groupBy,
  labelFilter,
  activeEmail,
  activeGroupKey,
  onSelectContact,
  onSelectCompany,
}: {
  contacts: ContactListItem[];
  companies: CompanySummary[];
  // Full-history per-domain people counts — the row header must not show
  // the loaded window's count (often 0) under a company that has people
  domainStats: DomainStat[];
  // "company": one flat A→Z list; "label": sectioned by label path
  groupBy: "company" | "label";
  // Restrict to companies under this label id (from the sidebar's GROUPS)
  labelFilter?: string | null;
  activeEmail: string | null;
  activeGroupKey: string | null;
  onSelectContact: (contact: ContactListItem) => void;
  // Clicking a company row shows its details in the pane
  onSelectCompany: (key: string) => void;
}) {
  // Only purposely-added companies (plus Personal) — auto domain groups
  // live in the Suggested view until the user adds or ignores them
  const groups = useMemo(() => {
    const all = groupContacts({ contacts, companies }).filter(
      (group) => group.company || group.key === "personal",
    );
    if (!labelFilter) return all;
    return all.filter(
      (group) =>
        group.company?.label?.id === labelFilter ||
        group.company?.label?.parent?.id === labelFilter,
    );
  }, [contacts, companies, labelFilter]);

  // Label grouping sections by label path ("Factory" then "Factory > …"),
  // then unlabeled companies, then Personal; company grouping is one flat
  // A→Z list (plus Personal)
  const sections = useMemo(() => {
    if (groupBy === "company") {
      const personal = groups.filter((group) => group.key === "personal");
      const rest = groups.filter((group) => group.key !== "personal");
      return [
        ...(rest.length ? [{ title: "Companies", groups: rest }] : []),
        ...personal.map((group) => ({ title: group.name, groups: [group] })),
      ];
    }

    const byLabel = new Map<string, ContactGroup[]>();
    const unlabeled: ContactGroup[] = [];
    const special: ContactGroup[] = [];

    for (const group of groups) {
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
  }, [groups, groupBy]);

  if (!sections.length) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No companies yet. Check the Suggested tab to add them from the domains
        in your email, or use “Add contact” and set a company.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section.title}>
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70">
            {section.title}
          </h3>
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {section.groups.map((group) => (
              <CompanyRow
                key={group.key}
                group={group}
                companies={companies}
                domainStats={domainStats}
                activeEmail={activeEmail}
                active={group.key === activeGroupKey}
                onSelectContact={onSelectContact}
                onSelectCompany={
                  group.company ? () => onSelectCompany(group.key) : undefined
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CompanyRow({
  group,
  companies,
  domainStats,
  activeEmail,
  active,
  onSelectContact,
  onSelectCompany,
}: {
  group: ContactGroup;
  companies: CompanySummary[];
  domainStats: DomainStat[];
  activeEmail: string | null;
  active: boolean;
  onSelectContact: (contact: ContactListItem) => void;
  onSelectCompany?: () => void;
}) {
  const [open, setOpen] = useState(false);

  // The page's contact list is a recency window, so a company's people may
  // not be in it at all — fetch them on expand from the full history (the
  // window's members render instantly as a fallback meanwhile)
  const fetchedMembers = useCompanyMembers({
    domains: group.domains,
    companyId: group.company?.id,
    enabled: open && !!group.company,
  });
  const members = fetchedMembers.data ?? group.contacts;
  const membersLoading =
    open && !!group.company && !fetchedMembers.data && !fetchedMembers.error;

  // Header count from the full history, not the loaded window
  const historyPeople = group.domains.reduce(
    (total, domain) =>
      total + (domainStats.find((stat) => stat.domain === domain)?.people ?? 0),
    0,
  );
  const peopleCount =
    fetchedMembers.data?.length ??
    Math.max(historyPeople, group.contacts.length);

  return (
    <div className="bg-background">
      <div
        className={cn(
          "flex items-center gap-3 px-3 py-2",
          active && "bg-muted/50",
        )}
      >
        {/* The chevron expands the member list; the row itself opens the
            company's details (Personal has none, so it just expands) */}
        <Button
          variant="ghost"
          size="iconSm"
          className="-ml-1.5 size-6 shrink-0"
          onClick={() => setOpen(!open)}
        >
          <span className="sr-only">
            {open ? "Collapse people" : "Show people"}
          </span>
          {open ? (
            <ChevronDownIcon className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          )}
        </Button>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => (onSelectCompany ? onSelectCompany() : setOpen(!open))}
        >
          {group.logoUrl ? (
            // biome-ignore lint/performance/noImgElement: external logos, not build assets
            <img
              src={group.logoUrl}
              alt=""
              width={32}
              height={32}
              onError={(event) => {
                event.currentTarget.style.visibility = "hidden";
              }}
              className={cn(
                "size-7 shrink-0 rounded object-cover p-0.5",
                group.company?.logoWhiteBackground ? "bg-white" : "bg-muted",
              )}
            />
          ) : (
            <div className="flex size-7 shrink-0 items-center justify-center rounded bg-muted">
              {group.key === "personal" ? (
                <UserIcon className="size-3.5" />
              ) : (
                <BuildingIcon className="size-3.5" />
              )}
            </div>
          )}
          <span className="min-w-0 truncate text-sm font-semibold uppercase tracking-wide">
            {group.name}
          </span>
          <span className="hidden min-w-0 truncate text-sm text-muted-foreground sm:inline">
            {group.domains.join(", ")}
            {group.domains.length > 0 && " · "}
            {peopleCount}
          </span>
        </button>
        {group.company?.label && (
          <Badge color="blue">{group.company.label.name}</Badge>
        )}
      </div>

      {open && (
        <div className="border-t border-border">
          {members.length ? (
            members.map((contact) => (
              <button
                key={contact.email}
                type="button"
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50",
                  contact.email === activeEmail && "bg-muted/50",
                )}
                onClick={() => onSelectContact(contact)}
              >
                <ContactAvatar contact={contact} companies={companies} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {contact.name || contact.email}
                    {contact.stale && (
                      <Badge className="ml-2" color="yellow">
                        Stale
                      </Badge>
                    )}
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {[contact.email, contact.title].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {membersLoading ? "Loading…" : "No contacts yet."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
