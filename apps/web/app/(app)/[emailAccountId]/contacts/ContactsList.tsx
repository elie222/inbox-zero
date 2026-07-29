"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import {
  ChevronDownIcon,
  IdCardIcon,
  PlusIcon,
  RefreshCwIcon,
  TagIcon,
} from "lucide-react";
import type { ContactsResponse } from "@/app/api/contacts/route";
import type { ContactDomainsResponse } from "@/app/api/contacts/domains/route";
import {
  contactAvatarUrl,
  contactDisplayName,
  contactKey,
  type CompanySummary,
  type ContactListItem,
  type LabelSummary,
  groupContacts,
  pendingDomainStats,
  resolveContactCompany,
} from "@/utils/contacts";
import { cn } from "@/utils";
import { SearchBar } from "@/components/SearchBar";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ContactDetailSheet } from "./ContactDetailSheet";
import { CompaniesView, PersonCard } from "./CompaniesView";
import { DomainSuggestions } from "./DomainSuggestions";
import { AddContactDialog } from "./AddContactDialog";
import { ManageLabelsDialog } from "./ManageLabelsDialog";
import { ExchangeSuggestions } from "./ExchangeSuggestions";
import { MyCardDialog } from "./MyCardDialog";
import { SyncSettingsDialog } from "./SyncSettingsDialog";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

// Recent → Name → Most emails, cycled from one chip rather than a third tab
// strip. The values are the ones /api/contacts already understands.
const SORTS = [
  { value: "recent", label: "Recent" },
  { value: "name", label: "Name" },
  { value: "frequent", label: "Most emails" },
] as const;
type Sort = (typeof SORTS)[number]["value"];

export function ContactsList() {
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  // Selection holds the full contact so people outside the current window
  // (e.g. from Suggested's on-demand member lists) still display; fresh data
  // is preferred by email lookup after mutations
  const [selectedContact, setSelectedContact] =
    useState<ContactListItem | null>(null);
  // A company selection shows company details in the pane instead
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [showMyCard, setShowMyCard] = useState(false);
  const [managingLabels, setManagingLabels] = useState(false);

  // View, sort and filters live in the URL, so the sidebar's GROUPS panel can
  // drive them with plain links. The curated company list is the main view;
  // a group selection shows people.
  const searchParams = useSearchParams();
  const setParam = useUrlParam();
  const viewParam = searchParams.get("view");
  const view = searchParams.get("group")
    ? "people"
    : viewParam === "people" ||
        viewParam === "suggested" ||
        viewParam === "labels"
      ? viewParam
      : "companies";
  // Every view reads A→Z by default — a directory is easiest to scan when
  // you can predict where a name sits
  const sortParam = searchParams.get("sort");
  const sort: Sort = SORTS.some((option) => option.value === sortParam)
    ? (sortParam as Sort)
    : "name";
  const groupKey = searchParams.get("group");
  // People-tab filter: everyone, only those with a company, or unassigned
  // (personal contacts are deliberately companyless, so they're excluded
  // from "No company")
  const whoParam = searchParams.get("who");
  const who = whoParam === "company" || whoParam === "none" ? whoParam : "all";
  // A label selection carries across the Companies/People tabs but means
  // nothing on Suggested — dropping it there keeps the header and detail
  // pane from contradicting the suggestions list
  const labelFilter = view === "suggested" ? null : searchParams.get("label");

  const params = new URLSearchParams({ sort, limit: String(limit) });
  if (search) params.set("search", search);
  const { data, isLoading, error } = useSWR<ContactsResponse>(
    `/api/contacts?${params.toString()}`,
    { keepPreviousData: true },
  );
  // Full-history per-domain volumes: Suggested list + company stats
  const { data: domainsData } = useSWR<ContactDomainsResponse>(
    "/api/contacts/domains",
  );
  const domainStats = domainsData?.domains ?? [];

  // Mutations refresh every /api/contacts variant — the sidebar GROUPS panel
  // reads its own fixed key, which would otherwise go stale whenever this
  // page's key carries a search/sort/limit
  const { mutate: globalMutate } = useSWRConfig();
  const mutate = useCallback(
    () =>
      globalMutate(
        (key) => typeof key === "string" && key.startsWith("/api/contacts"),
      ),
    [globalMutate],
  );

  const companies = data?.companies ?? [];

  const groups = useMemo(
    () => groupContacts({ contacts: data?.contacts ?? [], companies }),
    [data?.contacts, companies],
  );

  // Scope contacts to the sidebar selection (a group or a label) so the
  // people view and the detail-pane fallback both respect it
  const filteredContacts = useMemo(() => {
    if (groupKey) {
      return groups.find((group) => group.key === groupKey)?.contacts ?? [];
    }
    if (labelFilter) {
      return groups
        .filter(
          (group) =>
            group.company?.label?.id === labelFilter ||
            group.company?.label?.parent?.id === labelFilter,
        )
        .flatMap((group) => group.contacts);
    }
    const all = data?.contacts ?? [];
    if (view === "people" && who !== "all") {
      return all.filter((contact) => {
        const hasCompany = !!resolveContactCompany(contact, companies);
        return who === "company"
          ? hasCompany
          : !hasCompany && !contact.isPersonal;
      });
    }
    return all;
  }, [data?.contacts, groups, groupKey, labelFilter, view, who, companies]);

  const setSelected = (contact: ContactListItem) => {
    setSelectedGroupKey(null);
    setSelectedContact(contact);
  };
  const setSelectedGroup = (key: string) => {
    setSelectedContact(null);
    setSelectedGroupKey(key);
  };
  const closePane = () => {
    setSelectedContact(null);
    setSelectedGroupKey(null);
  };

  // Prefer the fresh row from the current window (mutations re-read it), fall
  // back to the captured object for out-of-window selections
  const selected = selectedContact
    ? (data?.contacts.find(
        (contact) => contactKey(contact) === contactKey(selectedContact),
      ) ?? selectedContact)
    : null;
  const selectedGroup = selectedGroupKey
    ? (groups.find((group) => group.key === selectedGroupKey) ?? null)
    : null;
  const activeContactKey = selected ? contactKey(selected) : null;

  const pendingSuggestions = useMemo(
    () =>
      pendingDomainStats(domainStats, companies, data?.ignoredDomains ?? []),
    [domainStats, companies, data?.ignoredDomains],
  );

  // Someone who handed their details back is waiting on a decision, so they
  // count towards the tab badge alongside the domain suggestions
  const pendingExchanges = data?.pendingExchanges ?? [];
  const suggestedCount = pendingSuggestions.length + pendingExchanges.length;

  const activeLabelName = labelFilter
    ? labelPath(data?.labels ?? [], labelFilter)
    : null;
  const activeGroupName = groupKey
    ? groups.find((group) => group.key === groupKey)?.name
    : activeLabelName;

  const countLine = !data
    ? "Everyone you email, built automatically from your mail history."
    : activeGroupName
      ? `${activeGroupName} · ${filteredContacts.length} ${
          filteredContacts.length === 1 ? "person" : "people"
        }`
      : view === "suggested"
        ? `${suggestedCount} waiting on a decision`
        : view === "people"
          ? `${filteredContacts.length} ${
              filteredContacts.length === 1 ? "person" : "people"
            }`
          : `${data.contacts.length} people across ${companies.length} ${
              companies.length === 1 ? "company" : "companies"
            }`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* One control bar: identity, view, search, actions */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
        <h1 className="font-display text-2xl tracking-tight">Contacts</h1>
        {/* A sidebar group selection speaks for itself; tabs would contradict it */}
        {!groupKey && (
          <Tabs defaultValue="companies" searchParam="view">
            <TabsList className="h-9">
              <TabsTrigger value="companies">Companies</TabsTrigger>
              <TabsTrigger value="labels">Labels</TabsTrigger>
              <TabsTrigger value="people">People</TabsTrigger>
              <TabsTrigger value="suggested">
                Suggested
                {suggestedCount > 0 && (
                  <span className="ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary/15 px-1 text-[11px] font-semibold text-primary">
                    {suggestedCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        <SearchBar
          onSearch={setSearch}
          placeholder="Search contacts…"
          className="w-full min-w-0 flex-1 sm:w-auto sm:max-w-sm"
        />
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            title="My card"
            onClick={() => setShowMyCard(true)}
          >
            <IdCardIcon className="size-4" />
            <span className="sr-only">My card</span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            title="Sync"
            onClick={() => setShowSync(true)}
          >
            <RefreshCwIcon className="size-4" />
            <span className="sr-only">Sync</span>
          </Button>
          <Button size="sm" onClick={() => setAdding(true)}>
            <PlusIcon className="mr-1.5 size-4" />
            Add contact
          </Button>
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto px-4 pb-6 pt-3 sm:px-6 sm:pt-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
            {countLine}
          </span>
          {view !== "suggested" && (
            <FilterChip
              label="Label"
              value={activeLabelName ?? "All"}
              options={[
                { value: "", label: "All" },
                ...(data?.labels ?? []).map((label) => ({
                  value: label.id,
                  label: labelPath(data?.labels ?? [], label.id) ?? label.name,
                })),
              ]}
              onSelect={(value) => setParam("label", value)}
            />
          )}
          {view === "people" && (
            <FilterChip
              label="Show"
              value={WHO_LABELS[who]}
              options={[
                { value: "", label: WHO_LABELS.all },
                { value: "company", label: WHO_LABELS.company },
                { value: "none", label: WHO_LABELS.none },
              ]}
              onSelect={(value) => setParam("who", value)}
            />
          )}
          {view === "labels" && (
            <Button
              variant="outline"
              size="sm"
              className="h-[30px]"
              onClick={() => setManagingLabels(true)}
            >
              <TagIcon className="mr-1.5 size-3.5" />
              Manage labels
            </Button>
          )}
          {view !== "suggested" && (
            <button
              type="button"
              className="inline-flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] border border-border px-2.5 text-[12.5px] text-muted-foreground hover:bg-muted"
              onClick={() => setParam("sort", nextSort(sort))}
            >
              Sort:{" "}
              <span className="font-medium text-foreground">
                {SORTS.find((option) => option.value === sort)?.label}
              </span>
              <ChevronDownIcon className="size-3" />
            </button>
          )}
        </div>

        <LoadingContent loading={isLoading && !data} error={error}>
          {data &&
            (data.contacts.length || companies.length ? (
              view === "companies" || view === "labels" ? (
                <CompaniesView
                  contacts={data.contacts}
                  companies={companies}
                  domainStats={domainStats}
                  groupBy={view === "labels" ? "label" : "company"}
                  labelFilter={labelFilter}
                  search={search}
                  sort={sort}
                  activeContactKey={activeContactKey}
                  activeGroupKey={selectedGroupKey}
                  onSelectContact={setSelected}
                  onSelectCompany={setSelectedGroup}
                />
              ) : view === "suggested" ? (
                <>
                  <ExchangeSuggestions
                    mutateContacts={mutate}
                    pending={pendingExchanges}
                  />
                  <DomainSuggestions
                    stats={pendingSuggestions}
                    ignoredDomains={data.ignoredDomains}
                    ignoredEmails={data.ignoredEmails}
                    companies={companies}
                    search={search}
                    activeContactKey={activeContactKey}
                    onSelectContact={setSelected}
                    mutate={mutate}
                  />
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    {filteredContacts.map((contact) => (
                      <PersonCard
                        key={contactKey(contact)}
                        contact={contact}
                        companies={companies}
                        active={contactKey(contact) === activeContactKey}
                        onSelect={() => setSelected(contact)}
                      />
                    ))}
                  </div>
                  {data.hasMore && limit < MAX_LIMIT && (
                    <div className="mt-4 flex justify-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLimit(MAX_LIMIT)}
                      >
                        Show more
                      </Button>
                    </div>
                  )}
                </>
              )
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {search
                  ? `No contacts match “${search}”.`
                  : "No contacts yet. They'll appear here as your email history loads."}
              </p>
            ))}
        </LoadingContent>
      </div>

      {/* The pane is a drawer at every width — the list keeps the full column */}
      <ContactDetailSheet
        contact={selected}
        group={selectedGroup}
        companies={companies}
        labels={data?.labels ?? []}
        domainStats={domainStats}
        onClose={closePane}
        onSelectContact={setSelected}
        mutateContacts={mutate}
      />
      <AddContactDialog
        open={adding}
        onClose={() => setAdding(false)}
        companies={companies}
        mutateContacts={mutate}
      />
      {data && (
        <ManageLabelsDialog
          open={managingLabels}
          onClose={() => setManagingLabels(false)}
          labels={data.labels}
          mutate={mutate}
        />
      )}
      {data && (
        <SyncSettingsDialog
          open={showSync}
          onClose={() => setShowSync(false)}
          sync={data.sync}
          mutateContacts={mutate}
        />
      )}
      <MyCardDialog open={showMyCard} onClose={() => setShowMyCard(false)} />
    </div>
  );
}

const WHO_LABELS = {
  all: "Everyone",
  company: "With company",
  none: "No company",
} as const;

// "Label: All ▾" — the mockup's one filter shape, reused for the People view's
// company filter so the meta row reads as a single set of controls
function FilterChip({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onSelect: (value: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] border border-border px-2.5 text-[12.5px] text-muted-foreground hover:bg-muted"
        >
          {label}:{" "}
          <span className="max-w-32 truncate font-medium text-foreground">
            {value}
          </span>
          <ChevronDownIcon className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value || "all"}
            onSelect={() => onSelect(option.value)}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ContactAvatar({
  contact,
  companies,
  className,
}: {
  contact: Pick<
    ContactListItem,
    | "name"
    | "email"
    | "phones"
    | "photoUrl"
    | "useCompanyLogo"
    | "isPersonal"
    | "companyId"
    | "domain"
  >;
  companies: CompanySummary[];
  className?: string;
}) {
  // The logo proxy 404s when no provider has an image — fall back to the
  // initial instead of a broken-image glyph
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = contactAvatarUrl(contact, companies);
  const initial = contactDisplayName(contact).charAt(0).toUpperCase();

  // A company logo (not a personal photo) honors the company's white-chip
  // setting so dark marks stay visible on the dark theme
  const isLogo = !!src && src !== contact.photoUrl;
  const whiteChip =
    isLogo && !!resolveContactCompany(contact, companies)?.logoWhiteBackground;

  if (src && src !== failedSrc) {
    return (
      // biome-ignore lint/performance/noImgElement: external favicons/photos, not build assets
      <img
        src={src}
        alt=""
        width={32}
        height={32}
        onError={() => setFailedSrc(src)}
        className={cn(
          className ??
            "size-8 shrink-0 rounded-full bg-muted object-cover p-0.5",
          whiteChip && "bg-white",
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        className ?? "size-8 shrink-0 rounded-full bg-muted",
        "flex items-center justify-center text-sm font-medium",
      )}
    >
      {initial}
    </div>
  );
}

// Writes one search param without disturbing the others. An empty value drops
// the param, so "All" leaves a clean URL.
function useUrlParam() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams);
      if (value) {
        params.set(name, value);
      } else {
        params.delete(name);
      }
      const query = params.toString();
      router.replace(pathname + (query ? `?${query}` : ""), { scroll: false });
    },
    [router, pathname, searchParams],
  );
}

function nextSort(current: Sort): Sort {
  const index = SORTS.findIndex((option) => option.value === current);
  return SORTS[(index + 1) % SORTS.length].value;
}

// "Vendors › DMS" for a nested label, so one chip can name the whole path
function labelPath(labels: LabelSummary[], id: string): string | null {
  const label = labels.find((option) => option.id === id);
  if (!label) return null;
  const parent = label.parentId
    ? labels.find((option) => option.id === label.parentId)
    : null;
  return parent ? `${parent.name} › ${label.name}` : label.name;
}
