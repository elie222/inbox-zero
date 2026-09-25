"use client";

import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  BellIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Clock3Icon,
  FileIcon,
  FolderIcon,
  InboxIcon,
  type LucideIcon,
  MegaphoneIcon,
  MessagesSquareIcon,
  PenLineIcon,
  PlusIcon,
  SendIcon,
  ShieldAlertIcon,
  SparklesIcon,
  StarIcon,
  TagIcon,
  Trash2Icon,
  UserIcon,
  Users2Icon,
} from "lucide-react";
import type { MailboxLabelCount } from "@/utils/mail-engine/label-count-targets";
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
import { splitLabelsByListVisibility } from "./label-visibility";
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
  countsById: Map<string, MailboxLabelCount>;
  categories: MailCategory[];
  categoryHeading: string;
  labelsHeading: string;
  labelSingular: string;
  backToAppHref: string;
  onCompose: () => void;
  onCreateLabel: (name: string) => void;
  onEditMailboxItem: (edit: MailboxItemEdit) => Promise<boolean>;
  onDeleteMailboxItem: (item: MailboxItem) => Promise<boolean>;
  labelEditMode: "color" | "name-and-color";
  labelColorOptions: readonly MailboxItemColorOption[];
  /** Gmail lets a label be hidden from the label and message lists. */
  supportsLabelVisibility?: boolean;
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
};

export const MAIL_SCHEDULED_TYPE = "scheduled";

/** Everything the inbox isn't. Visited rarely enough to stay behind a toggle. */
const MAILBOX_ITEMS: SystemItem[] = [
  { name: "Drafts", type: "draft", countId: "DRAFT", Icon: FileIcon },
  { name: "Sent", type: "sent", countId: null, Icon: SendIcon },
  { name: "Archived", type: "archive", countId: null, Icon: ArchiveIcon },
  { name: "Starred", type: "starred", countId: null, Icon: StarIcon },
  {
    name: "Scheduled",
    type: MAIL_SCHEDULED_TYPE,
    countId: null,
    Icon: Clock3Icon,
  },
  { name: "Spam", type: "spam", countId: null, Icon: ShieldAlertIcon },
  { name: "Trash", type: "trash", countId: null, Icon: Trash2Icon },
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
  labelEditMode,
  labelColorOptions,
  supportsLabelVisibility = false,
  collapsibleCategories = false,
  collapsed = false,
  footer,
  unified = false,
  className,
}: MailSidebarProps) {
  const [isAddingLabel, setIsAddingLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const sidebarFolders = getMailSidebarFolders(folders);
  const { visibleLabels, hiddenLabels } = splitLabelsByListVisibility({
    labels,
    countsById,
  });
  const labelTree = getLabelTree(
    visibleLabels,
    labelEditMode === "name-and-color",
  );
  const hasNestedLabels = labelTree.some((root) => root.children.length > 0);
  // Hidden labels stay flat: they are an escape hatch, not a place to browse.
  const hiddenLabelNodes = getLabelTree(hiddenLabels, false);
  const hasHiddenActiveLabel = hiddenLabels.some(
    (label) => label.id === activeLabelId,
  );

  const isCategoryActive =
    !activeLabelId &&
    !activeFolderId &&
    categories.some((category) => category.type === activeType);
  const [showCategories, setShowCategories] = useState(isCategoryActive);
  const [showLabels, setShowLabels] = useState(true);
  const [showHiddenLabels, setShowHiddenLabels] = useState(false);
  // Nothing in the rail can toggle a group, so there a group follows the open
  // view rather than a stored choice, which would otherwise be a one-way door.
  // The expanded sidebar keeps whatever the user chose.
  const showCategoryRows =
    !collapsibleCategories || (collapsed ? isCategoryActive : showCategories);

  const isMailboxActive =
    !activeLabelId &&
    !activeFolderId &&
    MAILBOX_ITEMS.some((item) => item.type === activeType);
  const [showMailboxes, setShowMailboxes] = useState(isMailboxActive);
  const showMailboxRows = collapsed ? isMailboxActive : showMailboxes;

  useEffect(() => {
    if (isCategoryActive) setShowCategories(true);
  }, [isCategoryActive]);

  useEffect(() => {
    if (isMailboxActive) setShowMailboxes(true);
  }, [isMailboxActive]);

  // Expand when the open view changes to a label so a collapsed list can
  // still reveal the selected row. A same-label collapse stays put.
  useEffect(() => {
    if (activeLabelId) setShowLabels(true);
  }, [activeLabelId]);

  // Opening a hidden label from elsewhere (search, a thread's chips) must not
  // leave the sidebar without a row for the view the user is looking at.
  useEffect(() => {
    if (hasHiddenActiveLabel) setShowHiddenLabels(true);
  }, [hasHiddenActiveLabel]);

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
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-muted-foreground text-xs hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          <NavRow
            href={
              unified ? undefined : hrefFor({ kind: "type", type: "inbox" })
            }
            active={
              unified ||
              (!activeLabelId && !activeFolderId && activeType === "inbox")
            }
            icon={<InboxIcon className="size-4 shrink-0" />}
            name={unified ? "All inboxes" : "Inbox"}
            count={unified ? null : displayCount(countsById.get("INBOX"))}
            emphasizeCount
            collapsed={collapsed}
          />
        </nav>

        {!unified && (!collapsed || showMailboxRows) && (
          <>
            <GroupHeading
              collapsed={collapsed}
              expanded={showMailboxes}
              onToggle={() => setShowMailboxes((open) => !open)}
            >
              Mail
            </GroupHeading>
            {showMailboxRows && (
              <nav className="flex flex-col gap-px">
                {MAILBOX_ITEMS.map(({ name, type, countId, Icon }) => (
                  <NavRow
                    key={type}
                    href={hrefFor({ kind: "type", type })}
                    active={
                      !activeLabelId && !activeFolderId && activeType === type
                    }
                    icon={<Icon className="size-4 shrink-0" />}
                    name={name}
                    count={
                      countId ? displayCount(countsById.get(countId)) : null
                    }
                    collapsed={collapsed}
                  />
                ))}
              </nav>
            )}
          </>
        )}

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

        {!unified && (!collapsed || (showLabels && labelTree.length > 0)) ? (
          <>
            <GroupHeading
              collapsed={collapsed}
              expanded={showLabels}
              onToggle={() => setShowLabels((open) => !open)}
              action={
                <button
                  type="button"
                  onClick={() => {
                    setShowLabels(true);
                    setIsAddingLabel((open) => !open);
                  }}
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
            {showLabels && (
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
                    supportsLabelVisibility={supportsLabelVisibility}
                    onEditMailboxItem={onEditMailboxItem}
                    onDeleteMailboxItem={onDeleteMailboxItem}
                  />
                ))}
              </nav>
            )}

            {showLabels && hiddenLabelNodes.length > 0 && !collapsed && (
              <>
                <button
                  type="button"
                  onClick={() => setShowHiddenLabels((open) => !open)}
                  aria-expanded={showHiddenLabels}
                  className="flex items-center gap-1 rounded-md px-2.5 py-1 text-muted-foreground text-xs hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showHiddenLabels ? (
                    <ChevronDownIcon className="size-3" />
                  ) : (
                    <ChevronRightIcon className="size-3" />
                  )}
                  More
                </button>
                {showHiddenLabels && (
                  <nav className="flex flex-col gap-px">
                    {hiddenLabelNodes.map((node) => (
                      <LabelBranch
                        key={node.label.id}
                        node={node}
                        hasNestedLabels={false}
                        collapsed={collapsed}
                        activeLabelId={activeLabelId}
                        hrefFor={hrefFor}
                        countsById={countsById}
                        labelSingular={labelSingular}
                        labelEditMode={labelEditMode}
                        labelColorOptions={labelColorOptions}
                        supportsLabelVisibility={supportsLabelVisibility}
                        onEditMailboxItem={onEditMailboxItem}
                        onDeleteMailboxItem={onDeleteMailboxItem}
                      />
                    ))}
                  </nav>
                )}
              </>
            )}

            {showLabels && isAddingLabel && !collapsed ? (
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
  | "supportsLabelVisibility"
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
        visibility={
          props.supportsLabelVisibility
            ? {
                labelList: label.labelListVisibility,
                messageList: label.messageListVisibility,
              }
            : undefined
        }
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

  return (
    <div className="flex items-center gap-1 px-2.5 pt-4 pb-1.5">
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 cursor-pointer items-center font-medium text-muted-foreground text-xs hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="truncate">{children}</span>
        </button>
      ) : (
        <span className="flex-1 font-medium text-muted-foreground text-xs">
          {children}
        </span>
      )}
      {action}
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          tabIndex={-1}
          aria-hidden="true"
          className="cursor-pointer rounded-md p-0.5 text-muted-foreground hover:text-foreground"
        >
          {expanded ? (
            <ChevronDownIcon className="size-3 shrink-0" />
          ) : (
            <ChevronRightIcon className="size-3 shrink-0" />
          )}
        </button>
      ) : null}
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
      ? "bg-card font-medium text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_1px_rgba(17,24,39,0.05)]"
      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
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
              : "text-sidebar-muted-foreground",
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

/** Names a rail control that has room for its icon only. `null` when expanded. */
export function RailTooltip({
  label,
  children,
}: {
  label: string | null;
  children: ReactNode;
}) {
  if (!label) return children;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function getMailCategories({
  isGoogle,
  isOutlook,
}: {
  isGoogle: boolean;
  isOutlook: boolean;
}): MailCategory[] {
  if (isGoogle) return MAIL_CATEGORIES;
  if (isOutlook) return OUTLOOK_INBOX_CATEGORIES;
  return [];
}

export function getMailNavPath(target: MailNavTarget): `/${string}` {
  switch (target.kind) {
    case "label":
      return `/mail?type=label&labelId=${encodeURIComponent(target.labelId)}`;
    case "folder":
      return `/mail?type=folder&folderId=${encodeURIComponent(target.folderId)}`;
    case "type":
      return `/mail?type=${encodeURIComponent(target.type)}`;
  }
}

/**
 * Drafts are never unread, so the only number worth showing there is the total.
 * A zero is noise, so it renders as nothing at all.
 */
function displayCount(count: MailboxLabelCount | undefined): number | null {
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
