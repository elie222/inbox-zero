"use client";

import { useMemo, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { useForm } from "react-hook-form";
import { formatDistanceToNow } from "date-fns";
import {
  BuildingIcon,
  CheckIcon,
  PencilIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import {
  type CompanySummary,
  type ContactGroup,
  type ContactListItem,
  type DomainStat,
  type LabelSummary,
  domainLogoUrl,
} from "@/utils/contacts";
import type { LogoSource } from "@/utils/logo/fetch-logo";
import {
  deleteCompanyAction,
  mergeCompaniesAction,
  researchCompanyAction,
  updateCompanyAction,
} from "@/utils/actions/contact";
import { useAccount } from "@/providers/EmailAccountProvider";
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

// Right-pane details for a company group: stats and top people, plus an
// in-pane tabbed editor (Details / Logo / Manage) behind the Edit button —
// editing, logo choice, merge, and delete all live here now.
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
  onDeleted?: () => void;
}) {
  const company = group.company;
  const [editing, setEditing] = useState(false);

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
  const sortedMembers = [...members].sort(
    (a, b) => b.receivedCount + b.sentCount - (a.receivedCount + a.sentCount),
  );

  // Search the company's full-history people; without a search, show the
  // top 5 with a reveal for the rest
  const [peopleSearch, setPeopleSearch] = useState("");
  const [showAllPeople, setShowAllPeople] = useState(false);
  const searchTerm = peopleSearch.trim().toLowerCase();
  const matchedMembers = searchTerm
    ? sortedMembers.filter(
        (contact) =>
          contact.email.toLowerCase().includes(searchTerm) ||
          contact.name?.toLowerCase().includes(searchTerm) ||
          contact.title?.toLowerCase().includes(searchTerm),
      )
    : showAllPeople
      ? sortedMembers
      : sortedMembers.slice(0, 5);

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
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-2xl tracking-tight">
            {group.name}
          </h2>
          <p className="truncate text-sm text-muted-foreground">
            {group.domains.join(", ") || "No domains yet"}
          </p>
        </div>
        {company && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setEditing(!editing)}
          >
            {editing ? (
              <>
                <XIcon className="mr-1.5 size-3.5" />
                Done
              </>
            ) : (
              <>
                <PencilIcon className="mr-1.5 size-3.5" />
                Edit
              </>
            )}
          </Button>
        )}
      </div>

      {editing && company ? (
        <CompanyEditor
          company={company}
          companies={companies}
          labels={labels}
          mutate={mutateContacts}
          onDeleted={onDeleted}
        />
      ) : (
        <>
          {company?.label && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge color="blue">
                {company.label.parent
                  ? `${company.label.parent.name} › ${company.label.name}`
                  : company.label.name}
              </Badge>
              {staleCount > 0 && (
                <Badge color="yellow">{staleCount} stale</Badge>
              )}
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

          {company && (
            <CompanyAbout company={company} mutate={mutateContacts} />
          )}

          {sortedMembers.length === 0 &&
            !fetchedMembers.data &&
            !fetchedMembers.error &&
            group.domains.length > 0 && (
              <p className="text-sm text-muted-foreground">Loading people…</p>
            )}

          {sortedMembers.length > 0 && (
            <div>
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70">
                People
              </h3>
              <Input
                value={peopleSearch}
                placeholder={`Search ${company?.name ?? group.name} people…`}
                className="mb-2"
                onChange={(event) => setPeopleSearch(event.target.value)}
              />
              {matchedMembers.length ? (
                <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {matchedMembers.map((contact) => (
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
                          {[contact.title, contact.email]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {contact.receivedCount + contact.sentCount}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No people match.
                </p>
              )}
              {!searchTerm && !showAllPeople && sortedMembers.length > 5 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => setShowAllPeople(true)}
                >
                  Show all {sortedMembers.length} people
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// AI research: the summary of who the company is, a Research button that
// (re)runs it — reading their website via web search when available, plus
// the user's email history — and an Apply chip when the AI proposes a
// genuinely different official name (pure formatting fixes apply themselves)
function CompanyAbout({
  company,
  mutate,
}: {
  company: CompanySummary;
  mutate: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [suggestedName, setSuggestedName] = useState<string | null>(null);

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

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70">
          <SparklesIcon className="size-3 text-primary" />
          About
        </h3>
        <Button
          variant="outline"
          size="xs"
          loading={research.isExecuting}
          onClick={() => research.execute({ id: company.id })}
        >
          Research
        </Button>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
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

const EDITOR_TABS = [
  { key: "details", label: "Details" },
  { key: "logo", label: "Logo" },
  { key: "manage", label: "Manage" },
] as const;
type EditorTab = (typeof EDITOR_TABS)[number]["key"];

// The in-pane editor: everything the old edit modal held, broken out by tab
function CompanyEditor({
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
  onDeleted?: () => void;
}) {
  const [tab, setTab] = useState<EditorTab>("details");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {EDITOR_TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "details" && (
        <DetailsTab company={company} labels={labels} mutate={mutate} />
      )}
      {tab === "logo" && <LogoTab company={company} mutate={mutate} />}
      {tab === "manage" && (
        <ManageTab
          company={company}
          companies={companies}
          mutate={mutate}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}

function DetailsTab({
  company,
  labels,
  mutate,
}: {
  company: CompanySummary;
  labels: LabelSummary[];
  mutate: () => void;
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

  // Existing label id, "none", or "new"; a new label's parent picker holds
  // an existing top-level label id, "none", or "new" (name typed below)
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
        <p className="mt-1 text-sm text-muted-foreground">
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
      {/* Anchored so Save stays reachable while the pane scrolls */}
      <div className="sticky bottom-0 border-t border-border bg-background py-3">
        <Button type="submit" size="sm" loading={update.isExecuting}>
          Save
        </Button>
      </div>
    </form>
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
    <div className="space-y-5">
      <LogoPicker company={company} mutate={mutate} />

      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="company-logo-bg">White logo background</Label>
          <p className="mt-1 text-sm text-muted-foreground">
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
      </div>

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
    </div>
  );
}

function ManageTab({
  company,
  companies,
  mutate,
  onDeleted,
}: {
  company: CompanySummary;
  companies: CompanySummary[];
  mutate: () => void;
  onDeleted?: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [mergeTargetId, setMergeTargetId] = useState<string>("");

  const merge = useAction(mergeCompaniesAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Companies merged" });
      mutate();
      onDeleted?.();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  const del = useAction(deleteCompanyAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Company deleted" });
      mutate();
      onDeleted?.();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  const targets = companies.filter((candidate) => candidate.id !== company.id);
  const target = targets.find((candidate) => candidate.id === mergeTargetId);

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="merge-target">Merge into another company</Label>
        <p className="mt-1 text-sm text-muted-foreground">
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

      <div className="rounded-lg border border-destructive/40 p-4">
        <Label>Delete company</Label>
        <p className="mt-1 text-sm text-muted-foreground">
          People keep their history; they just stop being grouped under{" "}
          {company.name}, and its domains return to Suggested.
        </p>
        <Button
          variant="destructiveSoft"
          size="sm"
          className="mt-3"
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
        Sources
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
        here, across all of its domains.
      </p>
    </div>
  );
}
