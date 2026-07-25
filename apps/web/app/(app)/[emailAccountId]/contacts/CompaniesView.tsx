"use client";

import { useMemo, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { useForm } from "react-hook-form";
import {
  BuildingIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PencilIcon,
  UserIcon,
} from "lucide-react";
import {
  type CompanySummary,
  type ContactGroup,
  type ContactListItem,
  type DomainStat,
  groupContacts,
} from "@/utils/contacts";
import { updateCompanyAction } from "@/utils/actions/contact";
import type { UpdateCompanyBody } from "@/utils/actions/contact.validation";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getActionErrorMessage } from "@/utils/error";
import { toastError, toastSuccess } from "@/components/Toast";
import { cn } from "@/utils";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ContactAvatar } from "./ContactsList";
import { useCompanyMembers } from "./useCompanyMembers";

export function CompaniesView({
  contacts,
  companies,
  domainStats,
  labelFilter,
  activeEmail,
  activeGroupKey,
  onSelectContact,
  onSelectCompany,
  mutate,
}: {
  contacts: ContactListItem[];
  companies: CompanySummary[];
  // Full-history per-domain people counts — the row header must not show
  // the loaded window's count (often 0) under a company that has people
  domainStats: DomainStat[];
  // Restrict to companies under this label id (from the sidebar's GROUPS)
  labelFilter?: string | null;
  activeEmail: string | null;
  activeGroupKey: string | null;
  onSelectContact: (contact: ContactListItem) => void;
  // Clicking a company row shows its details in the pane
  onSelectCompany: (key: string) => void;
  mutate: () => void;
}) {
  const [editing, setEditing] = useState<CompanySummary | null>(null);

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

  // Labeled companies section by label path ("Factory" then "Factory > …"),
  // then unlabeled companies, then Personal
  const sections = useMemo(() => {
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
  }, [groups]);

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
                onEdit={
                  group.company ? () => setEditing(group.company) : undefined
                }
              />
            ))}
          </div>
        </div>
      ))}

      {editing && (
        <CompanyEditDialog
          company={editing}
          onClose={() => setEditing(null)}
          mutate={mutate}
        />
      )}
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
  onEdit,
}: {
  group: ContactGroup;
  companies: CompanySummary[];
  domainStats: DomainStat[];
  activeEmail: string | null;
  active: boolean;
  onSelectContact: (contact: ContactListItem) => void;
  onSelectCompany?: () => void;
  onEdit?: () => void;
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
              className="size-7 shrink-0 rounded bg-muted object-cover p-0.5"
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
        {onEdit && (
          <Button variant="ghost" size="iconSm" onClick={onEdit}>
            <span className="sr-only">Edit company</span>
            <PencilIcon className="size-4" />
          </Button>
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

function CompanyEditDialog({
  company,
  onClose,
  mutate,
}: {
  company: CompanySummary;
  onClose: () => void;
  mutate: () => void;
}) {
  const { emailAccountId } = useAccount();

  const { register, handleSubmit } = useForm<{
    name: string;
    domains: string;
    logoUrl: string;
    labelName: string;
    labelParentName: string;
  }>({
    defaultValues: {
      name: company.name,
      domains: company.domains.join(", "),
      logoUrl: company.logoUrl ?? "",
      labelName: company.label?.name ?? "",
      labelParentName: company.label?.parent?.name ?? "",
    },
  });

  const update = useAction(updateCompanyAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Company saved" });
      mutate();
      onClose();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  const onSubmit = handleSubmit((values) => {
    const body: Omit<UpdateCompanyBody, "id"> & { id: string } = {
      id: company.id,
      name: values.name.trim(),
      domains: values.domains
        .split(",")
        .map((domain) => domain.trim())
        .filter(Boolean),
      logoUrl: values.logoUrl.trim(),
      labelName: values.labelName.trim(),
      labelParentName: values.labelParentName.trim(),
    };
    update.execute(body);
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit company</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
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
              Everyone emailing from these domains is grouped under this
              company. Separate with commas.
            </p>
          </div>
          <div>
            <Label htmlFor="company-logo">Logo URL</Label>
            <Input
              id="company-logo"
              className="mt-2"
              placeholder="Leave empty to use the domain's logo"
              {...register("logoUrl")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="company-label">Label</Label>
              <Input
                id="company-label"
                className="mt-2"
                placeholder="e.g. Factory"
                {...register("labelName")}
              />
            </div>
            <div>
              <Label htmlFor="company-label-parent">Parent label</Label>
              <Input
                id="company-label-parent"
                className="mt-2"
                placeholder="Optional"
                {...register("labelParentName")}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={update.isExecuting}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
