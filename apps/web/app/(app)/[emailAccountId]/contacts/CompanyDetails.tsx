"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { formatDistanceToNow } from "date-fns";
import { BuildingIcon, CheckIcon } from "lucide-react";
import {
  type CompanySummary,
  type ContactGroup,
  type ContactListItem,
  type DomainStat,
  domainLogoUrl,
} from "@/utils/contacts";
import type { LogoSource } from "@/utils/logo/fetch-logo";
import { updateCompanyAction } from "@/utils/actions/contact";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getActionErrorMessage } from "@/utils/error";
import { toastError, toastSuccess } from "@/components/Toast";
import { cn } from "@/utils";
import { Badge } from "@/components/Badge";
import { Tooltip } from "@/components/Tooltip";
import { ContactAvatar } from "./ContactsList";
import { useCompanyMembers } from "./useCompanyMembers";

// Right-pane details for a company group: how you and this company interact
// (full-history volumes per domain), the busiest people, and a logo picker
// built from the company's domains.
export function CompanyDetails({
  group,
  companies,
  domainStats,
  onSelectContact,
  mutateContacts,
}: {
  group: ContactGroup;
  companies: CompanySummary[];
  domainStats: DomainStat[];
  onSelectContact: (contact: ContactListItem) => void;
  mutateContacts: () => void;
}) {
  const company = group.company;

  // The page's contact list is a recency window — fetch this company's
  // people from the full history so the list below matches the stats
  const fetchedMembers = useCompanyMembers({
    domains: group.domains,
    companyId: company?.id,
  });
  const members = fetchedMembers.data ?? group.contacts;

  // Full-history volumes across the company's domains
  const statsByDomain = new Map(domainStats.map((stat) => [stat.domain, stat]));
  const companyStats = group.domains
    .map((domain) => statsByDomain.get(domain))
    .filter((stat): stat is DomainStat => !!stat);
  const received = companyStats.reduce((total, s) => total + s.received, 0);
  const sent = companyStats.reduce((total, s) => total + s.sent, 0);
  const people = Math.max(
    companyStats.reduce((total, s) => total + s.people, 0),
    members.length,
  );
  const lastInteractionAt = [
    ...companyStats.map((s) => s.lastInteractionAt),
    ...members.map((c) => c.lastInteractionAt),
  ]
    .filter(Boolean)
    .map((date) => new Date(date as Date | string))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const staleCount = members.filter((c) => c.stale).length;

  // Already volume-sorted when fetched; re-sort covers the window fallback
  const topContacts = [...members]
    .sort(
      (a, b) => b.receivedCount + b.sentCount - (a.receivedCount + a.sentCount),
    )
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        {group.logoUrl ? (
          // biome-ignore lint/performance/noImgElement: external logos, not build assets
          <img
            src={group.logoUrl}
            alt=""
            width={48}
            height={48}
            onError={(event) => {
              event.currentTarget.style.visibility = "hidden";
            }}
            className={cn(
              "size-12 shrink-0 rounded-lg object-cover p-1",
              company?.logoWhiteBackground ? "bg-white" : "bg-muted",
            )}
          />
        ) : (
          <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted">
            <BuildingIcon className="size-5" />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="truncate font-display text-2xl tracking-tight">
            {group.name}
          </h2>
          <p className="truncate text-sm text-muted-foreground">
            {group.domains.join(", ") || "No domains yet"}
          </p>
        </div>
      </div>

      {company?.label && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge color="blue">
            {company.label.parent
              ? `${company.label.parent.name} › ${company.label.name}`
              : company.label.name}
          </Badge>
          {staleCount > 0 && <Badge color="yellow">{staleCount} stale</Badge>}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="People" value={people} />
        <StatCard label="Received" value={received} />
        <StatCard label="Sent" value={sent} />
      </div>
      {lastInteractionAt && (
        <p className="text-sm text-muted-foreground">
          Last activity{" "}
          {formatDistanceToNow(lastInteractionAt, { addSuffix: true })}
        </p>
      )}

      {company && <LogoPicker company={company} mutate={mutateContacts} />}

      {topContacts.length === 0 &&
        !fetchedMembers.data &&
        !fetchedMembers.error &&
        group.domains.length > 0 && (
          <p className="text-sm text-muted-foreground">Loading people…</p>
        )}

      {topContacts.length > 0 && (
        <div>
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70">
            Top people
          </h3>
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {topContacts.map((contact) => (
              <button
                key={contact.email}
                type="button"
                className="flex w-full items-center gap-3 bg-background px-3 py-2 text-left hover:bg-muted/50"
                onClick={() => onSelectContact(contact)}
              >
                <ContactAvatar contact={contact} companies={companies} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {contact.name || contact.email}
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {[contact.title, contact.email].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {contact.receivedCount + contact.sentCount}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="font-display text-2xl tabular-nums">{value}</div>
      <div className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70">
        {label}
      </div>
    </div>
  );
}

// One candidate per provider family so the user can see and pick the exact
// source (logo.dev, DuckDuckGo, the site's own icon, Google)
const LOGO_PICKER_SOURCES: { source: LogoSource; label: string }[] = [
  { source: "logo-dev", label: "logo.dev" },
  { source: "duckduckgo", label: "DuckDuckGo" },
  { source: "site", label: "Site icon" },
  { source: "google", label: "Google" },
];

function LogoPicker({
  company,
  mutate,
}: {
  company: CompanySummary;
  mutate: () => void;
}) {
  const { emailAccountId } = useAccount();
  // Source/domain combinations whose lookup 404s disappear from the picker
  // instead of leaving a blank tile
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());

  const update = useAction(updateCompanyAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Logo updated" });
      mutate();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  if (!company.domains.length) return null;

  const effectiveLogo = company.logoUrl || domainLogoUrl(company.domains[0]);

  const candidates = company.domains.flatMap((domain) =>
    LOGO_PICKER_SOURCES.map(({ source, label }) => ({
      domain,
      label,
      url: domainLogoUrl(domain, source),
    })),
  );
  const visible = candidates.filter(
    (candidate) => !failedUrls.has(candidate.url),
  );

  return (
    <div>
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70">
        Logo
      </h3>
      {visible.length ? (
        <div className="flex flex-wrap items-start gap-3">
          {visible.map(({ domain, label, url }) => {
            const selected = effectiveLogo === url;
            return (
              <div key={url} className="flex flex-col items-center gap-1">
                <Tooltip content={`${domain} — ${label}`}>
                  <button
                    type="button"
                    disabled={update.isExecuting}
                    className={cn(
                      "relative flex size-12 items-center justify-center rounded-lg border bg-muted p-1",
                      selected
                        ? "border-primary ring-1 ring-primary"
                        : "border-border hover:border-muted-foreground/40",
                    )}
                    onClick={() =>
                      update.execute({ id: company.id, logoUrl: url })
                    }
                  >
                    {/* biome-ignore lint/performance/noImgElement: external favicons, not build assets */}
                    <img
                      src={url}
                      alt={`${domain} logo from ${label}`}
                      width={40}
                      height={40}
                      onError={() => {
                        setFailedUrls(
                          (previous) => new Set([...previous, url]),
                        );
                      }}
                      className={cn(
                        "size-9 object-cover",
                        company.logoWhiteBackground && "rounded bg-white p-0.5",
                      )}
                    />
                    {selected && (
                      <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <CheckIcon className="size-3" />
                      </span>
                    )}
                  </button>
                </Tooltip>
                <span className="text-[10px] text-muted-foreground">
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BuildingIcon className="size-4" />
          No logo found from any source.
        </div>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        Pick which source's logo represents the company — it shows for everyone
        here, across all of its domains. A custom URL can be set from the edit
        dialog.
      </p>
    </div>
  );
}
