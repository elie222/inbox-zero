"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import type { LabelCountsResponse } from "@/app/api/labels/counts/route";
import type { ContactsResponse } from "@/app/api/contacts/route";
import type { ContactDomainsResponse } from "@/app/api/contacts/domains/route";
import type { TasksResponse } from "@/app/api/tasks/route";
import type { UserLabelsResponse } from "@/app/api/user/labels/route";
import { groupContacts, pendingDomainStats } from "@/utils/contacts";
import {
  isTaskOpen,
  isTaskOverdue,
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
} from "@/utils/tasks";
import { getLabelIcon } from "@/utils/label-icons";
import { getEmailTerminology } from "@/utils/terminology";
import {
  ArchiveIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleCheckBigIcon,
  FileIcon,
  InboxIcon,
  type LucideIcon,
  PenIcon,
  SendIcon,
  ShieldIcon,
  UsersRoundIcon,
} from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { useComposeModal } from "@/providers/ComposeModalProvider";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroupLabel,
  SidebarGroup,
  SidebarHeader,
  SidebarGroupContent,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenu,
  useSidebar,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { SetupProgressCard } from "@/components/SetupProgressCard";
import { SideNavMenu } from "@/components/SideNavMenu";
import { CommandShortcut } from "@/components/ui/command";
import { useSplitLabels } from "@/hooks/useLabels";
import { useUser } from "@/hooks/useUser";
import { LoadingContent } from "@/components/LoadingContent";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { NavUser } from "@/components/NavUser";
import { PremiumCard } from "@/components/PremiumCard";
import { Tooltip } from "@/components/Tooltip";
import { cn } from "@/utils";
import { APPS, getActiveAppId, getAppHref } from "@/utils/apps";

type NavItem = {
  name: string;
  shortName?: string;
  href: string;
  icon: LucideIcon | (() => React.ReactNode);
  target?: "_blank";
  count?: number;
  active?: boolean;
  beta?: boolean;
  new?: boolean;
  // Nesting depth for tree-style panels (labels → companies)
  indent?: 1 | 2;
  // Collapsible tree parents render a chevron that toggles their children
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
};

const mailFolders = [
  { name: "Inbox", icon: InboxIcon, type: "inbox" },
  { name: "Drafts", icon: FileIcon, type: "draft" },
  { name: "Sent", icon: SendIcon, type: "sent" },
  { name: "Archived", icon: ArchiveIcon, type: "archive" },
];

export function SideNav({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const path = usePathname();
  const { state, isMobile } = useSidebar();
  const expanded = state.includes("left-sidebar");

  // Mobile keeps the plain vertical sheet (apps live in the bottom tray);
  // desktop gets an icon rail with the contextual nav beside it
  if (isMobile) {
    return (
      <Sidebar collapsible="icon" {...props}>
        <SideNavBody path={path} />
      </Sidebar>
    );
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <div className="flex h-full min-h-0">
        <AppRail path={path} />
        {expanded && (
          <div className="flex h-full min-w-0 flex-1 flex-col">
            <SideNavBody path={path} />
          </div>
        )}
      </div>
    </Sidebar>
  );
}

// Header + contextual nav + footer. Shared between the mobile sheet and the
// content column beside the desktop rail.
function SideNavBody({ path }: { path: string }) {
  const { data: user } = useUser();
  const activeApp = getActiveAppId(path);

  const bottomItems: NavItem[] = useMemo(
    () =>
      user?.isAdmin
        ? [{ name: "Admin", href: "/admin", icon: ShieldIcon }]
        : [],
    [user?.isAdmin],
  );

  return (
    <>
      <SidebarHeader className="gap-0 pb-0 pt-3">
        <AccountSwitcher />
      </SidebarHeader>

      <SidebarContent>
        <SetupProgressCard />

        <SidebarGroupContent>
          {activeApp === "contacts" ? (
            <ContactsNav path={path} />
          ) : activeApp === "tasks" ? (
            <TasksNav path={path} />
          ) : activeApp === "settings" ? null : (
            <MailNav path={path} />
          )}

          {bottomItems.length > 0 && (
            <SidebarGroup>
              <SideNavMenu items={bottomItems} activeHref={path} />
            </SidebarGroup>
          )}
        </SidebarGroupContent>
      </SidebarContent>

      <PremiumCard isCollapsed={false} />

      <SidebarFooter className="pb-4">
        <SyncedStatus />
        <NavUser />
      </SidebarFooter>
    </>
  );
}

const FOLDER_DOT_COLORS = [
  "bg-emerald-500",
  "bg-pink-500",
  "bg-violet-500",
  "bg-green-500",
  "bg-sky-500",
  "bg-amber-500",
  "bg-red-500",
  "bg-cyan-500",
];

// Stable per-folder accent dot, hashed from the folder name. A label tree
// passes hue/lightness instead so everything under one parent stays in the
// parent's color family, just in different shades.
function FolderDot({
  name,
  hue,
  lightness,
}: {
  name: string;
  hue?: number;
  lightness?: number;
}) {
  if (hue !== undefined) {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center">
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: `hsl(${hue} 65% ${lightness ?? 55}%)` }}
        />
      </span>
    );
  }

  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const color = FOLDER_DOT_COLORS[Math.abs(hash) % FOLDER_DOT_COLORS.length];

  return (
    <span className="flex size-4 shrink-0 items-center justify-center">
      <span className={cn("size-2 rounded-full", color)} />
    </span>
  );
}

// The family's base hue, hashed from the parent label's name
function familyHue(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 360;
}

// Shade ladder inside a family: the parent gets the base, descendants walk
// through visibly distinct lightness steps of the same hue
const FAMILY_LIGHTNESS = [55, 70, 42, 78, 48, 64, 36, 74];

// Small "synced" heartbeat like a desktop mail client — stamps the time of
// the latest unread-counts refresh (shared SWR cache, no extra request)
function SyncedStatus() {
  const { data } = useSWR<LabelCountsResponse>("/api/labels/counts");
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (data) setSyncedAt(new Date());
  }, [data]);

  if (!syncedAt) return null;

  return (
    <div className="flex items-center gap-2 px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70">
      <span className="size-1.5 rounded-full bg-green-500" />
      Synced ·{" "}
      {syncedAt.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "UTC",
      })}{" "}
      UTC
    </div>
  );
}

// Vertical icon-only app switcher on the left edge of the sidebar (desktop)
function AppRail({ path }: { path: string }) {
  const { emailAccountId } = useAccount();
  const activeApp = getActiveAppId(path);

  return (
    <div className="flex h-full w-12 shrink-0 flex-col items-center gap-1 border-r border-sidebar-border py-2">
      <Link
        href="/mail"
        className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary/15"
      >
        <LogoMark className="h-6" />
        <span className="sr-only">Zerrow home</span>
      </Link>
      {APPS.map((app) => (
        <Tooltip key={app.id} content={app.name}>
          <Link
            href={getAppHref(emailAccountId, app)}
            className={cn(
              "flex size-9 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              app.id === activeApp &&
                "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
          >
            <app.icon className="size-5" />
            <span className="sr-only">{app.name}</span>
          </Link>
        </Tooltip>
      ))}
      <div className="flex-1" />
      <SidebarTrigger name="left-sidebar" />
    </div>
  );
}

// GROUPS panel for the Contacts app: a tree of labels — each with its child
// labels and member companies nested beneath — then Personal, Other, and
// Suggested. Shares the page's SWR caches.
function ContactsNav({ path }: { path: string }) {
  const { emailAccountId } = useAccount();
  const searchParams = useSearchParams();
  // Label tree starts collapsed; expanding a parent reveals what's inside
  const [expandedLabels, setExpandedLabels] = useState<Set<string>>(
    () => new Set(),
  );
  const { data } = useSWR<ContactsResponse>(
    "/api/contacts?sort=recent&limit=100",
  );
  const { data: domainsData } = useSWR<ContactDomainsResponse>(
    "/api/contacts/domains",
  );

  const items: NavItem[] = useMemo(() => {
    const contactsPath = prefixPath(emailAccountId, "/contacts");
    const currentGroup = searchParams.get("group");
    const currentLabel = searchParams.get("label");

    const base: NavItem[] = [
      {
        name: "All contacts",
        href: contactsPath,
        icon: UsersRoundIcon,
        count: data?.contacts.length,
        active:
          path.includes("/contacts") &&
          !currentGroup &&
          !currentLabel &&
          searchParams.get("view") !== "suggested",
      },
    ];

    if (!data) return base;

    const groups = groupContacts({
      contacts: data.contacts,
      companies: data.companies,
    });

    // Label tree: parent labels, their child labels, and the companies
    // under each — companies are dynamic subgroups of their label
    type LabelNode = {
      id: string;
      name: string;
      groups: typeof groups;
      children: Map<string, LabelNode>;
    };
    const roots = new Map<string, LabelNode>();
    const nodeFor = (
      map: Map<string, LabelNode>,
      id: string,
      name: string,
    ): LabelNode => {
      const existing = map.get(id);
      if (existing) return existing;
      const node = { id, name, groups: [], children: new Map() };
      map.set(id, node);
      return node;
    };
    for (const group of groups) {
      const label = group.company?.label;
      if (!label) continue;
      if (label.parent) {
        const root = nodeFor(roots, label.parent.id, label.parent.name);
        nodeFor(root.children, label.id, label.name).groups.push(group);
      } else {
        nodeFor(roots, label.id, label.name).groups.push(group);
      }
    }

    const countOf = (node: LabelNode): number =>
      node.groups.reduce((total, group) => total + group.contacts.length, 0) +
      [...node.children.values()].reduce(
        (total, child) => total + countOf(child),
        0,
      );
    const labelHref = (id: string) =>
      `${contactsPath}?view=labels&label=${encodeURIComponent(id)}`;
    const companyItem = (
      group: (typeof groups)[number],
      indent: 1 | 2,
      hue?: number,
      lightness?: number,
    ): NavItem => ({
      name: group.name,
      href: `${contactsPath}?group=${encodeURIComponent(group.key)}`,
      icon: () => (
        <FolderDot name={group.name} hue={hue} lightness={lightness} />
      ),
      count: group.contacts.length,
      active: currentGroup === group.key,
      indent,
    });

    const toggleLabel = (id: string) =>
      setExpandedLabels((previous) => {
        const next = new Set(previous);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });

    for (const root of [...roots.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      // Everything inside a parent stays in the parent's color family —
      // descendants walk the shade ladder so each row reads distinct
      const hue = familyHue(root.name);
      let shadeIndex = 0;
      const nextShade = () =>
        FAMILY_LIGHTNESS[++shadeIndex % FAMILY_LIGHTNESS.length];
      const expanded = expandedLabels.has(root.id);

      base.push({
        name: root.name,
        href: labelHref(root.id),
        icon: () => (
          <FolderDot
            name={root.name}
            hue={hue}
            lightness={FAMILY_LIGHTNESS[0]}
          />
        ),
        count: countOf(root),
        active: currentLabel === root.id,
        expandable: true,
        expanded,
        onToggleExpand: () => toggleLabel(root.id),
      });
      if (!expanded) continue;

      for (const group of root.groups)
        base.push(companyItem(group, 1, hue, nextShade()));
      for (const child of [...root.children.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      )) {
        const childLightness = nextShade();
        base.push({
          name: child.name,
          href: labelHref(child.id),
          icon: () => (
            <FolderDot name={child.name} hue={hue} lightness={childLightness} />
          ),
          count: countOf(child),
          active: currentLabel === child.id,
          indent: 1,
        });
        for (const group of child.groups)
          base.push(companyItem(group, 2, hue, nextShade()));
      }
    }

    const personal = groups.find((group) => group.key === "personal");
    if (personal) {
      base.push({
        name: "Personal",
        href: `${contactsPath}?group=personal`,
        icon: () => <FolderDot name="Personal" />,
        count: personal.contacts.length,
        active: currentGroup === "personal",
      });
    }

    // People at public email domains who aren't marked personal
    const other = groups.find((group) => group.key === "other");
    if (other) {
      base.push({
        name: "Other",
        href: `${contactsPath}?group=other`,
        icon: () => <FolderDot name="Other" />,
        count: other.contacts.length,
        active: currentGroup === "other",
      });
    }

    // Domains seen in email but not yet added as (or to) a company
    const suggestedCount = pendingDomainStats(
      domainsData?.domains ?? [],
      data.companies,
      data.ignoredDomains,
    ).length;
    if (suggestedCount > 0) {
      base.push({
        name: "Suggested",
        href: `${contactsPath}?view=suggested`,
        icon: () => <FolderDot name="Suggested" />,
        count: suggestedCount,
        active: searchParams.get("view") === "suggested",
      });
    }

    return base;
  }, [emailAccountId, data, domainsData, path, searchParams, expandedLabels]);

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground/70">
        Groups
      </SidebarGroupLabel>
      <SideNavMenu items={items} activeHref={path} />
    </SidebarGroup>
  );
}

// VIEWS panel for the Tasks app: All / My tasks / Delegated / Overdue, then a
// count per status. Shares the page's SWR cache.
function TasksNav({ path }: { path: string }) {
  const { emailAccountId } = useAccount();
  const searchParams = useSearchParams();
  const { data } = useSWR<TasksResponse>("/api/tasks");

  const items: NavItem[] = useMemo(() => {
    const tasksPath = prefixPath(emailAccountId, "/tasks");
    const currentView = searchParams.get("view");
    const currentStatus = searchParams.get("status");
    const onTasks = path.includes("/tasks");
    const tasks = data?.tasks ?? [];
    const open = tasks.filter((task) => isTaskOpen(task.status));

    const views: NavItem[] = [
      {
        name: "All tasks",
        href: tasksPath,
        icon: CircleCheckBigIcon,
        count: open.length,
        active: onTasks && !currentView && !currentStatus,
      },
      {
        name: "Delegated",
        href: `${tasksPath}?view=delegated`,
        icon: () => <FolderDot name="Delegated" />,
        count: open.filter((task) => task.assigneeEmail).length,
        active: currentView === "delegated",
      },
      {
        name: "Overdue",
        href: `${tasksPath}?view=overdue`,
        icon: () => <FolderDot name="Overdue" />,
        count: open.filter((task) => isTaskOverdue(task)).length,
        active: currentView === "overdue",
      },
    ];

    const byStatus: NavItem[] = TASK_STATUS_ORDER.map((status) => ({
      name: TASK_STATUS_LABELS[status],
      href: `${tasksPath}?status=${status}`,
      icon: () => <FolderDot name={TASK_STATUS_LABELS[status]} />,
      count: tasks.filter((task) => task.status === status).length,
      active: currentStatus === status,
    }));

    return [...views, ...byStatus];
  }, [emailAccountId, data, path, searchParams]);

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground/70">
        Views
      </SidebarGroupLabel>
      <SideNavMenu items={items} activeHref={path} />
    </SidebarGroup>
  );
}

function MailNav({ path }: { path: string }) {
  const { onOpen } = useComposeModal();
  const [showHiddenLabels, setShowHiddenLabels] = useState(false);
  const { visibleLabels, hiddenLabels, isLoading } = useSplitLabels();
  const { emailAccountId, provider } = useAccount();
  const searchParams = useSearchParams();
  const terminology = getEmailTerminology(provider);
  const { data: countsData } = useSWR<LabelCountsResponse>(
    "/api/labels/counts",
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  const counts = countsData?.counts;

  const { data: dbLabels } = useSWR<UserLabelsResponse>("/api/user/labels");
  const iconByGmailLabelId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const dbLabel of dbLabels ?? []) {
      if (dbLabel.icon) map[dbLabel.gmailLabelId] = dbLabel.icon;
    }
    return map;
  }, [dbLabels]);

  const isMailPage = path.includes("/mail");
  const currentType = searchParams.get("type");
  const currentLabelId = searchParams.get("labelId");
  const mailPath = prefixPath(emailAccountId, "/mail");

  const folderItems = useMemo(
    () =>
      mailFolders.map((folder) => ({
        name: folder.name,
        icon: folder.icon,
        href: `${mailPath}?type=${folder.type}`,
        count: folder.type === "inbox" ? counts?.INBOX : undefined,
        active:
          isMailPage &&
          (currentType === folder.type ||
            (folder.type === "inbox" && !currentType)),
      })),
    [mailPath, isMailPage, currentType, counts],
  );

  const toLabelNavItem = (label: {
    id?: string | null;
    name?: string | null;
  }) => {
    const customIcon = label.id ? iconByGmailLabelId[label.id] : undefined;
    return {
      name: label.name ?? "",
      // Nested Gmail labels ("Work/Invoices") read better as their last segment
      shortName: (label.name ?? "").split("/").pop() || (label.name ?? ""),
      // Custom icons win; otherwise a per-folder colored dot
      icon: customIcon
        ? getLabelIcon(customIcon)
        : () => <FolderDot name={label.name ?? ""} />,
      href: `${mailPath}?type=label&labelId=${encodeURIComponent(label.id ?? "")}`,
      count: label.id ? counts?.[label.id] : undefined,
      active:
        isMailPage && currentType === "label" && currentLabelId === label.id,
    };
  };

  const labelNavItems = visibleLabels.map(toLabelNavItem);
  const hiddenLabelNavItems = hiddenLabels.map(toLabelNavItem);

  return (
    <>
      <SidebarGroup>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="h-9 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              onClick={onOpen}
              sidebarName="left-sidebar"
            >
              <PenIcon className="size-4" />
              <span className="truncate font-semibold">Compose</span>
              <CommandShortcut>C</CommandShortcut>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground/70">
          Views
        </SidebarGroupLabel>
        <SideNavMenu items={folderItems} activeHref={path} />
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground/70">
          Folders
        </SidebarGroupLabel>
        <LoadingContent loading={isLoading}>
          {visibleLabels.length > 0 ? (
            <SideNavMenu items={labelNavItems} activeHref={path} />
          ) : (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No {terminology.label.plural}
            </div>
          )}

          {/* Hidden labels toggle */}
          {hiddenLabels.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowHiddenLabels(!showHiddenLabels)}
                className="flex w-full items-center px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {showHiddenLabels ? (
                  <ChevronDownIcon className="mr-1 size-4" />
                ) : (
                  <ChevronRightIcon className="mr-1 size-4" />
                )}
                <span>More</span>
              </button>

              {showHiddenLabels && (
                <SideNavMenu items={hiddenLabelNavItems} activeHref={path} />
              )}
            </>
          )}
        </LoadingContent>
      </SidebarGroup>
    </>
  );
}
