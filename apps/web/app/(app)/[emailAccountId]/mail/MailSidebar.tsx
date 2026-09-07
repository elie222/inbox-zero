"use client";

import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  BellIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  InboxIcon,
  KeyboardIcon,
  type LucideIcon,
  MegaphoneIcon,
  MessagesSquareIcon,
  PenLineIcon,
  PlusIcon,
  SendIcon,
  SparklesIcon,
  TagIcon,
  UserIcon,
  Users2Icon,
} from "lucide-react";
import type { LabelCount } from "@/app/api/labels/counts/route";
import { Kbd } from "@/components/Kbd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getShortcutHint } from "@/lib/shortcuts/registry";
import type { EmailLabel } from "@/providers/email-label-types";
import { GmailLabel } from "@/utils/gmail/label";
import { cn } from "@/utils";
import type { OutlookFolder } from "@/utils/outlook/folders";
import { OUTLOOK_INBOX_SECTIONS } from "@/utils/mail/outlook-inbox";
import { getLabelTree, type SidebarLabel } from "./label-tree";
import { getMailSidebarFolders } from "./outlook-folder-list";
import {
  MailboxItemContextMenu,
  type MailboxItemColorOption,
  type MailboxItem,
  type MailboxItemEdit,
} from "./MailboxItemContextMenu";

/** Where a sidebar row navigates. Mirrors the mail page's `?type=` query shape. */
export type MailNavTarget =
  | { kind: "type"; type: string }
  | { kind: "label"; labelId: string }
  | { kind: "folder"; folderId: string };

export type MailSidebarProps = {
  /** `?type=` of the current view — `inbox` when nothing is selected. */
  activeType: string | null;
  /** `?labelId=` of the current view, when a user label is open. */
  activeLabelId: string | null;
  /** `?folderId=` of the current view, when an Outlook folder is open. */
  activeFolderId: string | null;
  /** Builds the href for a row so the sidebar never owns routing. */
  hrefFor: (target: MailNavTarget) => string;
  labels: EmailLabel[];
  folders: OutlookFolder[];
  /** Keyed by provider label/folder id. Arrives after first paint; may be empty. */
  countsById: Map<string, LabelCount>;
  categories: MailCategory[];
  categoryHeading: string;
  labelsHeading: string;
  labelSingular: string;
  backToAppHref: string;
  onCompose: () => void;
  onCreateLabel: (name: string) => void;
  onEditMailboxItem: (edit: MailboxItemEdit) => Promise<boolean>;
  onDeleteMailboxItem: (item: MailboxItem) => Promise<boolean>;
  onOpenShortcuts: () => void;
  labelEditMode: "color" | "name-and-color";
  labelColorOptions: readonly MailboxItemColorOption[];
  /** Hide the categories group behind a toggle, collapsed by default. */
  collapsibleCategories?: boolean;
  /** Icon-only rail: rows shrink to their icon and names move into tooltips. */
  collapsed?: boolean;
  footer?: ReactNode;
  unified?: boolean;
  className?: string;
};

type SystemItem = {
  name: string;
  type: string;
  /** null means the row never shows a count (a "sent unread" number is noise). */
  countId: string | null;
  Icon: LucideIcon;
  emphasizeCount?: boolean;
};

const SYSTEM_ITEMS: SystemItem[] = [
  {
    name: "Inbox",
    type: "inbox",
    countId: "INBOX",
    Icon: InboxIcon,
    emphasizeCount: true,
  },
  { name: "Drafts", type: "draft", countId: "DRAFT", Icon: FileIcon },
  { name: "Sent", type: "sent", countId: null, Icon: SendIcon },
  { name: "Archived", type: "archive", countId: null, Icon: ArchiveIcon },
];

export type MailCategory = {
  name: string;
  type: string;
  Icon: LucideIcon;
};

export const MAIL_CATEGORIES: MailCategory[] = [
  {
    name: "Personal",
    type: GmailLabel.PERSONAL,
    Icon: UserIcon,
  },
  {
    name: "Social",
    type: GmailLabel.SOCIAL,
    Icon: Users2Icon,
  },
  {
    name: "Updates",
    type: GmailLabel.UPDATES,
    Icon: BellIcon,
  },
  {
    name: "Forums",
    type: GmailLabel.FORUMS,
    Icon: MessagesSquareIcon,
  },
  {
    name: "Promotions",
    type: GmailLabel.PROMOTIONS,
    Icon: MegaphoneIcon,
  },
];

export const OUTLOOK_INBOX_CATEGORIES: MailCategory[] =
  OUTLOOK_INBOX_SECTIONS.map((section) => ({
    ...section,
    Icon: section.type === "focused" ? SparklesIcon : InboxIcon,
  }));

export function MailSidebar({
  activeType,
  activeLabelId,
  activeFolderId,
  hrefFor,
  labels,
  folders,
  countsById,
  categories,
  categoryHeading,
  labelsHeading,
  labelSingular,
  backToAppHref,
  onCompose,
  onCreateLabel,
  onEditMailboxItem,
  onDeleteMailboxItem,
  onOpenShortcuts,
  labelEditMode,
  labelColorOptions,
  collapsibleCategories = false,
  collapsed = false,
  footer,
  unified = false,
  className,
}: MailSidebarProps) {
  const [isAddingLabel, setIsAddingLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const sidebarFolders = getMailSidebarFolders(folders);
  const labelTree = getLabelTree(labels, labelEditMode === "name-and-color");
  const hasNestedLabels = labelTree.some((root) => root.children.length > 0);

  const isCategoryActive =
    !activeLabelId &&
    !activeFolderId &&
    categories.some((category) => category.type === activeType);
  const [showCategories, setShowCategories] = useState(isCategoryActive);
  const showCategoryRows = !collapsibleCategories || showCategories;

  useEffect(() => {
    if (isCategoryActive) setShowCategories(true);
  }, [isCategoryActive]);

  const submitNewLabel = (event: FormEvent) => {
    event.preventDefault();
    const name = newLabelName.trim();
    if (!name) return;
    onCreateLabel(name);
    setNewLabelName("");
    setIsAddingLabel(false);
  };

  return (
    <aside
      className={cn(
        "flex w-[236px] shrink-0 flex-col overflow-hidden border-border border-r bg-sidebar pt-3 pb-2.5",
        collapsed ? "px-1.5" : "px-2.5",
        className,
      )}
    >
      {collapsed ? (
        <div
          data-desktop-mac-titlebar-spacer
          className="mb-2.5 flex shrink-0 justify-center"
        >
          <SidebarTrigger
            name="left-sidebar"
            className="text-muted-foreground"
          />
        </div>
      ) : (
        <div className="mb-2.5 flex shrink-0 items-center gap-1">
          <Link
            href={backToAppHref}
            data-desktop-mac-end
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground text-xs hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeftIcon className="size-3.5 shrink-0" />
            <span className="flex-1 truncate" data-hide-on-desktop-mac>
              Inbox Zero
            </span>
          </Link>
          <SidebarTrigger
            name="left-sidebar"
            className="size-6 shrink-0 text-muted-foreground"
          />
        </div>
      )}

      {collapsed ? (
        <RailTooltip label="Compose">
          <Button
            variant="gradient"
            size="icon"
            onClick={onCompose}
            aria-label="Compose"
            className="mb-3.5 size-10 shrink-0 self-center rounded-xl"
          >
            <PenLineIcon className="size-4" />
          </Button>
        </RailTooltip>
      ) : (
        <Button
          variant="gradient"
          onClick={onCompose}
          className="mb-3.5 w-full shrink-0 justify-start gap-2 rounded-xl px-3"
        >
          <PenLineIcon className="size-4 shrink-0" />
          <span className="flex-1 text-left">Compose</span>
          <Kbd variant="onColor">{getShortcutHint("compose")}</Kbd>
        </Button>
      )}

      {/* The negative margin lets the scrollbar sit in the sidebar's own
          padding, so a platform-width bar can't crowd the unread counts. */}
      <div className="-mr-1.5 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1.5 scrollbar-thin">
        <nav className="flex flex-col gap-px">
          {(unified ? SYSTEM_ITEMS.slice(0, 1) : SYSTEM_ITEMS).map(
            ({ name, type, countId, Icon, emphasizeCount }) => (
              <NavRow
                key={type}
                href={unified ? undefined : hrefFor({ kind: "type", type })}
                active={
                  unified ||
                  (!activeLabelId && !activeFolderId && activeType === type)
                }
                icon={<Icon className="size-4 shrink-0" />}
                name={unified ? "All inboxes" : name}
                count={
                  unified || !countId
                    ? null
                    : displayCount(countsById.get(countId))
                }
                emphasizeCount={emphasizeCount}
                collapsed={collapsed}
              />
            ),
          )}
        </nav>

        {/* The rail replaces headings with a rule, so an empty group would
            leave a stray line behind. */}
        {!unified &&
          categories.length > 0 &&
          (!collapsed || showCategoryRows) && (
            <>
              <GroupHeading
                collapsed={collapsed}
                expanded={collapsibleCategories ? showCategories : undefined}
                onToggle={
                  collapsibleCategories
                    ? () => setShowCategories((open) => !open)
                    : undefined
                }
              >
                {categoryHeading}
              </GroupHeading>
              {showCategoryRows && (
                <nav className="flex flex-col gap-px">
                  {categories.map(({ name, type, Icon }) => (
                    <NavRow
                      key={type}
                      href={hrefFor({ kind: "type", type })}
                      active={
                        !activeLabelId && !activeFolderId && activeType === type
                      }
                      icon={<Icon className="size-3.5 shrink-0" />}
                      name={name}
                      count={null}
                      collapsed={collapsed}
                    />
                  ))}
                </nav>
              )}
            </>
          )}

        {!unified && sidebarFolders.length > 0 && (
          <>
            <GroupHeading collapsed={collapsed}>Folders</GroupHeading>
            <nav className="flex flex-col gap-px">
              {sidebarFolders.map((folder) => (
                <MailboxItemContextMenu
                  key={folder.id}
                  item={{
                    kind: "folder",
                    id: folder.id,
                    name: folder.displayName,
                  }}
                  typeName="folder"
                  editMode="name"
                  onEdit={onEditMailboxItem}
                  onDelete={onDeleteMailboxItem}
                >
                  <NavRow
                    href={hrefFor({ kind: "folder", folderId: folder.id })}
                    active={activeFolderId === folder.id}
                    icon={
                      <FolderIcon
                        className="size-3.5 shrink-0"
                        style={
                          collapsed
                            ? undefined
                            : { marginLeft: folder.depth * 12 }
                        }
                      />
                    }
                    name={folder.displayName}
                    count={displayCount(countsById.get(folder.id))}
                    collapsed={collapsed}
                  />
                </MailboxItemContextMenu>
              ))}
            </nav>
          </>
        )}

        {!unified && (!collapsed || labelTree.length > 0) ? (
          <>
            <GroupHeading
              collapsed={collapsed}
              action={
                <button
                  type="button"
                  onClick={() => setIsAddingLabel((open) => !open)}
                  aria-expanded={isAddingLabel}
                  aria-label={`Create ${labelSingular}`}
                  className="rounded-md p-0.5 text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <PlusIcon className="size-3.5" />
                </button>
              }
            >
              {labelsHeading}
            </GroupHeading>
            <nav className="flex flex-col gap-px">
              {labelTree.map((node) => (
                <LabelBranch
                  key={node.label.id}
                  node={node}
                  hasNestedLabels={hasNestedLabels}
                  collapsed={collapsed}
                  activeLabelId={activeLabelId}
                  hrefFor={hrefFor}
                  countsById={countsById}
                  labelSingular={labelSingular}
                  labelEditMode={labelEditMode}
                  labelColorOptions={labelColorOptions}
                  onEditMailboxItem={onEditMailboxItem}
                  onDeleteMailboxItem={onDeleteMailboxItem}
                />
              ))}
            </nav>

            {isAddingLabel && !collapsed ? (
              <form
                onSubmit={submitNewLabel}
                className="flex gap-1.5 px-2.5 py-2"
              >
                <Input
                  value={newLabelName}
                  onChange={(event) => setNewLabelName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setIsAddingLabel(false);
                  }}
                  placeholder={`${labelSingular} name`}
                  aria-label={`New ${labelSingular} name`}
                  autoFocus
                  className="h-7 min-w-0 flex-1 px-2 text-xs"
                />
                <Button
                  type="submit"
                  variant="gradient"
                  size="xs-2"
                  disabled={!newLabelName.trim()}
                >
                  Add
                </Button>
              </form>
            ) : null}
          </>
        ) : null}
      </div>

      {collapsed ? (
        <RailTooltip label="Keyboard shortcuts">
          <button
            type="button"
            onClick={onOpenShortcuts}
            aria-label="Keyboard shortcuts"
            className="mt-2 flex size-10 shrink-0 items-center justify-center self-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <KeyboardIcon className="size-4" />
          </button>
        </RailTooltip>
      ) : (
        <button
          type="button"
          onClick={onOpenShortcuts}
          className="mt-2 flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-muted-foreground text-xs hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <KeyboardIcon className="size-3.5 shrink-0" />
          <span className="flex-1 text-left">Keyboard shortcuts</span>
          <Kbd>{getShortcutHint("help")}</Kbd>
        </button>
      )}
      {footer}
    </aside>
  );
}

function LabelBranch({
  node,
  hasNestedLabels,
  collapsed,
  ...props
}: Pick<
  MailSidebarProps,
  | "activeLabelId"
  | "hrefFor"
  | "countsById"
  | "labelSingular"
  | "labelEditMode"
  | "labelColorOptions"
  | "onEditMailboxItem"
  | "onDeleteMailboxItem"
> & { node: SidebarLabel; hasNestedLabels: boolean; collapsed: boolean }) {
  const { label, children } = node;
  const activeDescendantId = children.some((child) =>
    containsLabel(child, props.activeLabelId),
  )
    ? props.activeLabelId
    : null;
  // Branches start closed so a deep label tree doesn't flood the sidebar; only
  // the branch holding the open label reveals itself.
  const [expansion, setExpansion] = useState({
    activeDescendantId,
    expanded: activeDescendantId !== null,
  });
  // Reveal each newly selected descendant while retaining unrelated collapse choices.
  if (expansion.activeDescendantId !== activeDescendantId) {
    setExpansion({
      activeDescendantId,
      expanded: activeDescendantId !== null || expansion.expanded,
    });
  }
  // The rail has no room for a disclosure arrow, so it lists every label flat.
  const expanded = collapsed || expansion.expanded;

  return (
    <div>
      <MailboxItemContextMenu
        item={{ kind: "label", id: label.id, name: label.name }}
        typeName={props.labelSingular}
        editMode={props.labelEditMode}
        currentColor={label.color}
        colorOptions={props.labelColorOptions}
        onEdit={props.onEditMailboxItem}
        onDelete={props.onDeleteMailboxItem}
      >
        <div className="relative">
          {children.length > 0 && !collapsed && (
            <button
              type="button"
              aria-label={`${expanded ? "Collapse" : "Expand"} ${label.name}`}
              aria-expanded={expanded}
              onClick={() =>
                setExpansion({ activeDescendantId, expanded: !expanded })
              }
              className="absolute top-1/2 left-0 z-10 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {expanded ? (
                <ChevronDownIcon className="size-3" />
              ) : (
                <ChevronRightIcon className="size-3" />
              )}
            </button>
          )}
          <NavRow
            href={props.hrefFor({ kind: "label", labelId: label.id })}
            active={props.activeLabelId === label.id}
            icon={
              collapsed ? (
                <TagIcon
                  className="size-4 shrink-0"
                  style={{ color: label.color?.backgroundColor }}
                />
              ) : (
                <span
                  className="size-2.5 shrink-0 rounded-full bg-muted-foreground/40"
                  style={
                    label.color?.backgroundColor
                      ? { backgroundColor: label.color.backgroundColor }
                      : undefined
                  }
                />
              )
            }
            // Flattened rows lose their parent context, so the tooltip carries
            // the full path instead of the leaf name.
            name={collapsed ? label.name : node.name}
            count={displayCount(props.countsById.get(label.id))}
            nested={hasNestedLabels && !collapsed}
            collapsed={collapsed}
          />
        </div>
      </MailboxItemContextMenu>
      {expanded && children.length > 0 && (
        <div className={collapsed ? undefined : "ml-3"}>
          {children.map((child) => (
            <LabelBranch
              key={child.label.id}
              node={child}
              hasNestedLabels={hasNestedLabels}
              collapsed={collapsed}
              {...props}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GroupHeading({
  children,
  action,
  expanded,
  onToggle,
  collapsed,
}: {
  children: ReactNode;
  action?: ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
  collapsed?: boolean;
}) {
  // A heading can't fit in the rail, so groups are separated by a rule instead.
  if (collapsed) return <div className="mx-auto my-2 h-px w-6 bg-border" />;

  if (onToggle) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 pt-4 pb-1.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex flex-1 cursor-pointer items-center gap-1 font-medium text-muted-foreground text-xs hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span>{children}</span>
          {expanded ? (
            <ChevronDownIcon className="size-3 shrink-0" />
          ) : (
            <ChevronRightIcon className="size-3 shrink-0" />
          )}
        </button>
        {action}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-2.5 pt-4 pb-1.5">
      <span className="flex-1 font-medium text-muted-foreground text-xs">
        {children}
      </span>
      {action}
    </div>
  );
}

function NavRow({
  href,
  active,
  icon,
  name,
  count,
  emphasizeCount,
  nested,
  collapsed,
}: {
  href?: string;
  active: boolean;
  icon: ReactNode;
  name: string;
  count: number | null;
  emphasizeCount?: boolean;
  nested?: boolean;
  collapsed?: boolean;
}) {
  const className = cn(
    "flex items-center rounded-lg text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    collapsed
      ? "relative mx-auto size-10 justify-center"
      : "gap-2.5 px-2.5 py-1.5",
    nested && "pl-7",
    active
      ? "bg-primary/10 font-medium text-foreground"
      : "text-muted-foreground hover:bg-accent hover:text-foreground",
  );
  const content = collapsed ? (
    <>
      {icon}
      {count !== null && (
        // The rail has no room for a number, so unread mail shows as a dot.
        <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" />
      )}
      <span className="sr-only">{name}</span>
    </>
  ) : (
    <>
      {icon}
      <span className="flex-1 truncate">{name}</span>
      {count !== null && (
        <span
          className={cn(
            "shrink-0 text-xs",
            emphasizeCount
              ? "rounded-full bg-primary/10 px-1.5 py-px font-medium text-primary"
              : "text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
    </>
  );

  const row = href ? (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={className}
    >
      {content}
    </Link>
  ) : (
    <div aria-current={active ? "page" : undefined} className={className}>
      {content}
    </div>
  );

  if (!collapsed) return row;

  return (
    <RailTooltip label={count === null ? name : `${name} (${count})`}>
      {row}
    </RailTooltip>
  );
}

function RailTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Drafts are never unread, so the only number worth showing there is the total.
 * A zero is noise, so it renders as nothing at all.
 */
function displayCount(count: LabelCount | undefined): number | null {
  if (!count) return null;
  const value = count.id === "DRAFT" ? count.total : count.unread;
  return value > 0 ? value : null;
}

function containsLabel(node: SidebarLabel, labelId: string | null): boolean {
  return (
    node.label.id === labelId ||
    node.children.some((child) => containsLabel(child, labelId))
  );
}
