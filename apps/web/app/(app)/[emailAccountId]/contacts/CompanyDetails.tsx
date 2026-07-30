"use client";

import { type CSSProperties, useMemo, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { useForm } from "react-hook-form";
import { BuildingIcon, CheckIcon, SparklesIcon, UserIcon } from "lucide-react";
import {
  type CompanySummary,
  contactDisplayName,
  contactKey,
  type ContactGroup,
  type ContactListItem,
  type DomainStat,
  type LabelSummary,
  domainLogoUrl,
} from "@/utils/contacts";
import { rollUpCompanyStats } from "@/utils/contacts-aggregates";
import { nameHue } from "@/utils/name-color";
import type { LogoSource } from "@/utils/logo/fetch-logo";
import {
  deleteCompanyAction,
  mergeCompaniesAction,
  researchCompanyAction,
  updateCompanyAction,
} from "@/utils/actions/contact";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useThreads } from "@/hooks/useThreads";
import { prefixPath } from "@/utils/path";
import { getActionErrorMessage } from "@/utils/error";
import { toastError, toastSuccess } from "@/components/Toast";
import { cn } from "@/utils";
import { Badge } from "@/components/Badge";
import { Tooltip } from "@/components/Tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContactAvatar } from "./ContactsList";
import { useCompanyMembers } from "./useCompanyMembers";
import {
  LatestThreadCard,
  PaneCard,
  PaneSectionTitle,
  PaneShell,
} from "./PaneChrome";

const COMPANY_TABS = [
  { key: "overview", label: "Overview" },
  { key: "people", label: "People" },
  { key: "details", label: "Details" },
  { key: "logo", label: "Logo" },
];

// The company drawer: rolled-up stats in the header, then Overview / People /
// Details / Logo. "Personal" is a group rather than a company, so it gets the
// first two tabs only — there's nothing to edit.
export function CompanyDetails({
  group,
  companies,
  labels,
  domainStats,
  onSelectContact,
  mutateContacts,
  onDeleted,
}: {
  group: ContactGroup;
  companies: CompanySummary[];
  // Every label on the account — feeds the label/parent pickers
  labels: LabelSummary[];
  domainStats: DomainStat[];
  onSelectContact: (contact: ContactListItem) => void;
  mutateContacts: () => void;
  // The company was deleted or merged away — clear the selection
  onDeleted: () => void;
}) {
  const { emailAccountId } = useAccount();
  const company = group.company;
  const [tab, setTab] = useState("overview");

  // The page's contact list is a recency window — fetch this company's people
  // from the full history so the list below matches the stats
  const fetchedMembers = useCompanyMembers({
    domains: group.domains,
    companyId: company?.id,
  });
  const members = fetchedMembers.data ?? group.contacts;
  const stats = rollUpCompanyStats({
    domains: group.domains,
    domainStats,
    members,
  });

  // Already volume-sorted when fetched; re-sort covers the window fallback
  const sortedMembers = [...members].sort(
    (a, b) => b.receivedCount + b.sentCount - (a.receivedCount + a.sentCount),
  );
  const staleCount = members.filter((contact) => contact.stale).length;

  // No company-wide thread query exists, so the busiest person's latest thread
  // stands in for the company's — which is what you'd open anyway
  const busiest = sortedMembers[0];
  const threads = useThreads({
    fromEmail: busiest?.email ?? undefined,
    type: "all",
    limit: 1,
  });
  const latestMessage = threads.data?.threads[0]?.messages.at(-1);

  const tabs = company
    ? COMPANY_TABS
    : COMPANY_TABS.filter(
        (option) => option.key !== "details" && option.key !== "logo",
      );

  return (
    <PaneShell
      mark={<CompanyMark group={group} />}
      title={group.name}
      subtitle={
        group.domains.join(", ") ||
        (company ? "No domains yet" : "Kept out of company grouping")
      }
      stats={[
        { value: stats.people, label: "people" },
        { value: stats.received, label: "received" },
        { value: stats.sent, label: "sent" },
      ]}
      lastInteractionAt={stats.lastInteractionAt}
      tabs={tabs}
      activeTab={tab}
      onTabChange={setTab}
    >
      {tab === "overview" && (
        <>
          {(company?.label || staleCount > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {company?.label && (
                <Badge color="blue">
                  {company.label.parent
                    ? `${company.label.parent.name} › ${company.label.name}`
                    : company.label.name}
                </Badge>
              )}
              {staleCount > 0 && (
                <Badge color="yellow">{staleCount} stale</Badge>
              )}
            </div>
          )}

          {company && (
            <CompanyAbout company={company} mutate={mutateContacts} />
          )}

          {sortedMembers.length > 0 && (
            <div>
              <PaneSectionTitle className="mb-2">Top people</PaneSectionTitle>
              <div className="divide-y divide-border overflow-hidden rounded-[10px] border border-border bg-card">
                {sortedMembers.slice(0, 3).map((contact) => (
                  <MemberRow
                    key={contactKey(contact)}
                    contact={contact}
                    companies={companies}
                    onSelect={() => onSelectContact(contact)}
                  />
                ))}
              </div>
              {sortedMembers.length > 3 && (
                <button
                  type="button"
                  className="mt-2 text-[12.5px] font-medium text-primary hover:underline"
                  onClick={() => setTab("people")}
                >
                  Show all {sortedMembers.length} people →
                </button>
              )}
            </div>
          )}

          {sortedMembers.length === 0 &&
            !fetchedMembers.data &&
            !fetchedMembers.error &&
            group.domains.length > 0 && (
              <p className="text-sm text-muted-foreground">Loading people…</p>
            )}

          {busiest?.email && (
            <LatestThreadCard
              subject={latestMessage?.headers.subject ?? null}
              date={
                latestMessage?.headers.date
                  ? new Date(latestMessage.headers.date)
                  : null
              }
              href={prefixPath(
                emailAccountId,
                `/mail?q=${encodeURIComponent(group.domains[0] ?? busiest.email)}`,
              )}
            />
          )}
        </>
      )}

      {tab === "people" && (
        <PeopleTab
          members={sortedMembers}
          companies={companies}
          name={group.name}
          onSelectContact={onSelectContact}
        />
      )}

      {tab === "details" && company && (
        <DetailsTab
          company={company}
          companies={companies}
          labels={labels}
          mutate={mutateContacts}
          onDeleted={onDeleted}
        />
      )}

      {tab === "logo" && company && (
        <LogoTab company={company} mutate={mutateContacts} />
      )}
    </PaneShell>
  );
}

function CompanyMark({ group }: { group: ContactGroup }) {
  const [failed, setFailed] = useState(false);

  if (group.key === "personal") {
    return (
      <span className="flex size-[52px] shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <UserIcon className="size-5" />
      </span>
    );
  }

  if (group.logoUrl && !failed) {
    return (
      // biome-ignore lint/performance/noImgElement: external logos, not build assets
      <img
        src={group.logoUrl}
        alt=""
        width={52}
        height={52}
        onError={() => setFailed(true)}
        className={cn(
          "size-[52px] shrink-0 rounded-xl object-cover p-1",
          group.company?.logoWhiteBackground ? "bg-white" : "bg-muted",
        )}
      />
    );
  }

  return (
    <span
      style={{ "--company-hue": nameHue(group.name) } as CSSProperties}
      className="company-chip flex size-[52px] shrink-0 items-center justify-center rounded-xl text-[17px] font-bold"
    >
      {group.name.charAt(0).toUpperCase()}
    </span>
  );
}

function PeopleTab({
  members,
  companies,
  name,
  onSelectContact,
}: {
  members: ContactListItem[];
  companies: CompanySummary[];
  name: string;
  onSelectContact: (contact: ContactListItem) => void;
}) {
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const matched = term
    ? members.filter(
        (contact) =>
          contact.email?.toLowerCase().includes(term) ||
          contact.name?.toLowerCase().includes(term) ||
          contact.title?.toLowerCase().includes(term),
      )
    : members;

  return (
    <>
      <Input
        value={search}
        placeholder={`Search ${name} people…`}
        onChange={(event) => setSearch(event.target.value)}
      />
      {matched.length ? (
        <div className="divide-y divide-border overflow-hidden rounded-[10px] border border-border bg-card">
          {matched.map((contact) => (
            <MemberRow
              key={contactKey(contact)}
              contact={contact}
              companies={companies}
              onSelect={() => onSelectContact(contact)}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No people match.</p>
      )}
    </>
  );
}

function MemberRow({
  contact,
  companies,
  onSelect,
}: {
  contact: ContactListItem;
  companies: CompanySummary[];
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-muted/40"
      onClick={onSelect}
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
      <span className="shrink-0 text-[12.5px] tabular-nums text-muted-foreground">
        {contact.receivedCount + contact.sentCount}
      </span>
    </button>
  );
}

// AI research: the summary of who the company is, a Research button that
// (re)runs it — reading their website via web search when available, plus the
// user's email history — and an Apply chip when the AI proposes a genuinely
// different official name (pure formatting fixes apply themselves)
function CompanyAbout({
  company,
  mutate,
}: {
  company: CompanySummary;
  mutate: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [suggestedName, setSuggestedName] = useState<string | null>(null);
  const [suggestedLabel, setSuggestedLabel] = useState<{
    name: string;
    parentName: string | null;
    isNew: boolean;
  } | null>(null);

  const research = useAction(researchCompanyAction.bind(null, emailAccountId), {
    onSuccess: (result) => {
      mutate();
      if (!result.data) return;
      if (result.data.renamed) {
        toastSuccess({
          description: `Saved — and renamed to ${result.data.suggestedName}`,
        });
      } else {
        toastSuccess({ description: "Company research saved" });
      }
      if (
        result.data.suggestedName &&
        !result.data.renamed &&
        result.data.suggestedName !== company.name
      ) {
        setSuggestedName(result.data.suggestedName);
      }
      setSuggestedLabel(result.data.suggestedLabel ?? null);
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  const rename = useAction(updateCompanyAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Company renamed" });
      setSuggestedName(null);
      mutate();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  const applyLabel = useAction(updateCompanyAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Label applied" });
      setSuggestedLabel(null);
      mutate();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  return (
    <PaneCard>
      <div className="flex items-center justify-between gap-2">
        <PaneSectionTitle>
          <SparklesIcon className="size-3 text-primary" />
          About
        </PaneSectionTitle>
        <Button
          variant="ghost"
          size="xs"
          className="h-9 sm:h-6 text-primary"
          loading={research.isExecuting}
          onClick={() => research.execute({ id: company.id })}
        >
          Research
        </Button>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-muted-foreground">
        {company.aiSummary ??
          "No summary yet — Research has the AI read the web and your email history to describe who this company is and what they do."}
      </p>
      {suggestedName && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
          <span className="min-w-0 truncate text-muted-foreground">
            Official name:{" "}
            <span className="text-foreground">{suggestedName}</span>
          </span>
          <Button
            variant="outline"
            size="xs"
            className="h-9 sm:h-6"
            loading={rename.isExecuting}
            onClick={() =>
              rename.execute({ id: company.id, name: suggestedName })
            }
          >
            <CheckIcon className="mr-1 size-3" />
            Apply
          </Button>
        </div>
      )}
      {suggestedLabel && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
          <span className="min-w-0 truncate text-muted-foreground">
            Suggested label:{" "}
            <span className="text-foreground">
              {suggestedLabel.parentName
                ? `${suggestedLabel.parentName} › ${suggestedLabel.name}`
                : suggestedLabel.name}
            </span>
            {suggestedLabel.isNew && " (new)"}
          </span>
          <Button
            variant="outline"
            size="xs"
            className="h-9 sm:h-6"
            loading={applyLabel.isExecuting}
            onClick={() =>
              applyLabel.execute({
                id: company.id,
                labelName: suggestedLabel.name,
                labelParentName: suggestedLabel.parentName ?? "",
              })
            }
          >
            <CheckIcon className="mr-1 size-3" />
            Apply
          </Button>
        </div>
      )}
    </PaneCard>
  );
}

function DetailsTab({
  company,
  companies,
  labels,
  mutate,
  onDeleted,
}: {
  company: CompanySummary;
  companies: CompanySummary[];
  labels: LabelSummary[];
  mutate: () => void;
  onDeleted: () => void;
}) {
  const { emailAccountId } = useAccount();

  // All labels on the account, children shown with their nesting path
  const labelById = useMemo(
    () => new Map(labels.map((label) => [label.id, label])),
    [labels],
  );
  const labelOptions = useMemo(
    () =>
      labels
        .map((label) => ({
          ...label,
          path: label.parentId
            ? `${labelById.get(label.parentId)?.name ?? "?"} › ${label.name}`
            : label.name,
        }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    [labels, labelById],
  );
  const topLevelLabels = labelOptions.filter((label) => !label.parentId);

  // Existing label id, "none", or "new"; a new label's parent picker holds an
  // existing top-level label id, "none", or "new" (name typed below)
  const [labelChoice, setLabelChoice] = useState(company.label?.id ?? "none");
  const [parentChoice, setParentChoice] = useState("none");

  const { register, handleSubmit } = useForm<{
    name: string;
    domains: string;
    newLabelName: string;
    newParentName: string;
  }>({
    defaultValues: {
      name: company.name,
      domains: company.domains.join(", "),
      newLabelName: "",
      newParentName: "",
    },
  });

  const update = useAction(updateCompanyAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Company saved" });
      mutate();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  return (
    <>
      <form
        className="space-y-4"
        onSubmit={handleSubmit((values) => {
          // The action takes names: an existing pick sends its current
          // name+parent (a no-op for nesting); "new" find-or-creates
          const picked =
            labelChoice === "none" || labelChoice === "new"
              ? null
              : (labelById.get(labelChoice) ?? null);
          const pickedParentName = picked?.parentId
            ? (labelById.get(picked.parentId)?.name ?? "")
            : "";
          const newParentName =
            parentChoice === "none"
              ? ""
              : parentChoice === "new"
                ? values.newParentName.trim()
                : (labelById.get(parentChoice)?.name ?? "");

          update.execute({
            id: company.id,
            name: values.name.trim(),
            domains: values.domains
              .split(",")
              .map((domain) => domain.trim())
              .filter(Boolean),
            labelName:
              labelChoice === "new"
                ? values.newLabelName.trim()
                : (picked?.name ?? ""),
            labelParentName:
              labelChoice === "new" ? newParentName : pickedParentName,
          });
        })}
      >
        <div>
          <Label htmlFor="company-name">Name</Label>
          <Input id="company-name" className="mt-2" {...register("name")} />
        </div>
        <div>
          <Label htmlFor="company-domains">Email domains</Label>
          <Input
            id="company-domains"
            className="mt-2"
            placeholder="toyota.com, lexus.com"
            {...register("domains")}
          />
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Everyone emailing from these domains is grouped under this company.
            Separate with commas.
          </p>
        </div>
        <div>
          <Label htmlFor="company-label">Label</Label>
          <Select value={labelChoice} onValueChange={setLabelChoice}>
            <SelectTrigger id="company-label" className="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No label</SelectItem>
              {labelOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.path}
                </SelectItem>
              ))}
              <SelectItem value="new">+ New label…</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {labelChoice === "new" && (
          <div className="space-y-3 rounded-md border border-border p-3">
            <div>
              <Label htmlFor="company-new-label">New label name</Label>
              <Input
                id="company-new-label"
                className="mt-2"
                placeholder="e.g. Factory"
                {...register("newLabelName")}
              />
            </div>
            <div>
              <Label htmlFor="company-new-label-parent">Nest under</Label>
              <Select value={parentChoice} onValueChange={setParentChoice}>
                <SelectTrigger id="company-new-label-parent" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No parent (top level)</SelectItem>
                  {topLevelLabels.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="new">+ New parent…</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {parentChoice === "new" && (
              <div>
                <Label htmlFor="company-new-parent-name">New parent name</Label>
                <Input
                  id="company-new-parent-name"
                  className="mt-2"
                  placeholder="e.g. Vendors"
                  {...register("newParentName")}
                />
              </div>
            )}
          </div>
        )}
        <Button type="submit" size="sm" loading={update.isExecuting}>
          Save
        </Button>
      </form>

      <MergeAndDelete
        company={company}
        companies={companies}
        mutate={mutate}
        onDeleted={onDeleted}
      />
    </>
  );
}

// The mockup only draws Delete; merge has no other home, and losing it would
// leave duplicate companies unfixable, so the two sit together
function MergeAndDelete({
  company,
  companies,
  mutate,
  onDeleted,
}: {
  company: CompanySummary;
  companies: CompanySummary[];
  mutate: () => void;
  onDeleted: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [mergeTargetId, setMergeTargetId] = useState<string>("");

  const merge = useAction(mergeCompaniesAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Companies merged" });
      mutate();
      onDeleted();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  const del = useAction(deleteCompanyAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Company deleted" });
      mutate();
      onDeleted();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  const targets = companies.filter((candidate) => candidate.id !== company.id);
  const target = targets.find((candidate) => candidate.id === mergeTargetId);

  return (
    <>
      <div>
        <Label htmlFor="merge-target">Merge into another company</Label>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          {company.name}'s people and domains move to the company you pick, then{" "}
          {company.name} is deleted.
        </p>
        <div className="mt-2 flex gap-2">
          <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
            <SelectTrigger id="merge-target" className="flex-1">
              <SelectValue placeholder="Pick a company" />
            </SelectTrigger>
            <SelectContent>
              {targets.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            disabled={!target}
            loading={merge.isExecuting}
            onClick={() => {
              if (
                target &&
                confirm(
                  `Merge ${company.name} into ${target.name}? ${company.name} will be deleted.`,
                )
              ) {
                merge.execute({ sourceId: company.id, targetId: target.id });
              }
            }}
          >
            Merge
          </Button>
        </div>
      </div>

      <div className="rounded-[10px] border border-destructive/40 p-3.5">
        <div className="text-[13px] font-medium">Delete company</div>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          People keep their history; they just stop being grouped under{" "}
          {company.name}, and its domains return to Suggested.
        </p>
        <Button
          variant="destructiveSoft"
          size="sm"
          className="mt-2.5"
          loading={del.isExecuting}
          onClick={() => {
            if (confirm(`Delete ${company.name}?`)) {
              del.execute({ id: company.id });
            }
          }}
        >
          Delete company
        </Button>
      </div>
    </>
  );
}

function LogoTab({
  company,
  mutate,
}: {
  company: CompanySummary;
  mutate: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [logoUrl, setLogoUrl] = useState(company.logoUrl ?? "");

  const update = useAction(updateCompanyAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Company saved" });
      mutate();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  return (
    <>
      <LogoPicker company={company} mutate={mutate} />

      <PaneCard className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="company-logo-bg">White logo background</Label>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            For dark logos that disappear against the dark theme.
          </p>
        </div>
        <Switch
          id="company-logo-bg"
          checked={company.logoWhiteBackground}
          disabled={update.isExecuting}
          onCheckedChange={(checked) =>
            update.execute({ id: company.id, logoWhiteBackground: checked })
          }
        />
      </PaneCard>

      <div>
        <Label htmlFor="company-logo-url">Custom logo URL</Label>
        <div className="mt-2 flex gap-2">
          <Input
            id="company-logo-url"
            value={logoUrl}
            placeholder="Leave empty to use the sources above"
            onChange={(event) => setLogoUrl(event.target.value)}
          />
          <Button
            variant="outline"
            size="sm"
            loading={update.isExecuting}
            onClick={() =>
              update.execute({ id: company.id, logoUrl: logoUrl.trim() })
            }
          >
            Save
          </Button>
        </div>
      </div>
    </>
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

  if (!company.domains.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Add an email domain on the Details tab and the logo sources will appear
        here.
      </p>
    );
  }

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
      <PaneSectionTitle className="mb-2">Sources</PaneSectionTitle>
      {visible.length ? (
        <div className="flex flex-wrap items-start gap-3.5">
          {visible.map(({ domain, label, url }) => {
            const selected = effectiveLogo === url;
            return (
              <div key={url} className="flex flex-col items-center gap-1.5">
                <Tooltip content={`${domain} — ${label}`}>
                  <button
                    type="button"
                    disabled={update.isExecuting}
                    className={cn(
                      "relative flex size-[52px] items-center justify-center rounded-[10px] border bg-muted p-1",
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
                        "size-10 object-cover",
                        company.logoWhiteBackground && "rounded bg-white p-0.5",
                      )}
                    />
                    {selected && (
                      <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <CheckIcon className="size-3" />
                      </span>
                    )}
                  </button>
                </Tooltip>
                <span className="flex max-w-[60px] flex-col items-center text-center text-[10.5px] leading-tight text-muted-foreground">
                  <span className="w-full truncate">{domain}</span>
                  <span className="w-full truncate">{label}</span>
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
      <p className="mt-2 text-[12.5px] text-muted-foreground">
        Pick which source's logo represents the company — it shows for everyone
        here, across all of its domains.
      </p>
    </div>
  );
}
