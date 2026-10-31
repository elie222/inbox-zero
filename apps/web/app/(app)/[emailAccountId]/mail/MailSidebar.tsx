"use client";

import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { getMailSidebarRowPresentation } from "@inboxzero/mail-ui/MailSidebarRow";
import {
  ArchiveIcon,
  BellIcon,
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
  SettingsIcon,
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
import { Tooltip as ShortcutTooltip } from "@/components/Tooltip";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { AppSidebarHeader } from "@/components/AppSidebarHeader";
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
import { OUTLOOK_INBOX_SECTIONS } from "@/utils/outlook/inbox-sections";
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
  /** Runs when a row navigates in place, including to the view already open. */
  onNavigate: () => void;
  labels: EmailLabel[];
  folders: OutlookFolder[];
  /** Keyed by provider label/folder id. Arrives after first paint; may be empty. */
  countsById: Map<string, MailboxLabelCount>;
  categories: MailCategory[];
  categoryHeading: string;
  labelsHeading: string;
  labelSingular: string;
  /** Builds the app section links in the shared sidebar header. */
  emailAccountId: string;
  hideToggle?: boolean;
  onCompose: () => void;
  onOpenSettings: () => void;
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
  /** Shared conversations from teammates. Omitted for users outside an organization. */
  team?: { href: string; unreadCount: number | null };
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
export const MAILBOX_ITEMS: SystemItem[] = [
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
  onNavigate,
  labels,
  folders,
  countsById,
  categories,
  categoryHeading,
  labelsHeading,
  labelSingular,
  emailAccountId,
  hideToggle,
  onCompose,
  onOpenSettings,
  onCreateLabel,
  onEditMailboxItem,
  onDeleteMailboxItem,
  labelEditMode,
  labelColorOptions,
  supportsLabelVisibility = false,
  collapsibleCategories = false,
  collapsed = false,
  team,
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
        // The padding matches the app sidebar so the shared header lines up.
        "flex w-[256px] shrink-0 flex-col overflow-hidden border-border border-r bg-sidebar px-2 pt-2 pb-2.5",
        className,
      )}
    >
      <AppSidebarHeader
        active="mail"
        emailAccountId={emailAccountId}
        collapsed={collapsed}
        hideToggle={hideToggle}
      />

      {collapsed ? (
        <ShortcutTooltip
          shortcuts={[{ id: "compose", label: "Compose" }]}
          side="right"
        >
          <Button
            variant="outline"
            size="icon"
            onClick={onCompose}
            aria-label="Compose"
            className="mb-2 size-8 shrink-0 self-center rounded-lg"
          >
            <PenLineIcon className="size-4 text-blue-600 dark:text-blue-400" />
          </Button>
        </ShortcutTooltip>
      ) : (
        <Button
          variant="outline"
          onClick={onCompose}
          aria-label="Compose"
          aria-keyshortcuts="c"
          // The 9px inset plus the border lines the icon up with the rows below.
          className="mb-3 w-full shrink-0 justify-start gap-2.5 rounded-xl px-[9px]"
        >
          <PenLineIcon className="size-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <span className="flex-1 text-left">Compose</span>
          <Kbd>{getShortcutHint("compose")}</Kbd>
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
            onNavigate={onNavigate}
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
              More
            </GroupHeading>
            <SidebarGroupContent open={showMailboxRows}>
              <nav className="flex flex-col gap-px">
                {MAILBOX_ITEMS.map(({ name, type, countId, Icon }) => (
                  <NavRow
                    key={type}
                    href={hrefFor({ kind: "type", type })}
                    onNavigate={onNavigate}
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
            </SidebarGroupContent>
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
              <SidebarGroupContent open={showCategoryRows}>
                <nav className="flex flex-col gap-px">
                  {categories.map(({ name, type, Icon }) => (
                    <NavRow
                      key={type}
                      href={hrefFor({ kind: "type", type })}
                      onNavigate={onNavigate}
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
              </SidebarGroupContent>
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
                    onNavigate={onNavigate}
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
            <SidebarGroupContent open={showLabels}>
              <nav className="flex flex-col gap-px">
                {labelTree.map((node) => (
                  <LabelBranch
                    key={node.label.id}
                    node={node}
                    hasNestedLabels={hasNestedLabels}
                    collapsed={collapsed}
                    activeLabelId={activeLabelId}
                    hrefFor={hrefFor}
                    onNavigate={onNavigate}
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

              {hiddenLabelNodes.length > 0 && !collapsed && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowHiddenLabels((open) => !open)}
                    aria-expanded={showHiddenLabels}
                    className="flex items-center gap-1 rounded-md px-2.5 py-1 text-muted-foreground text-xs hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <DisclosureChevron expanded={showHiddenLabels} />
                    More
                  </button>
                  <SidebarGroupContent open={showHiddenLabels}>
                    <nav className="flex flex-col gap-px">
                      {hiddenLabelNodes.map((node) => (
                        <LabelBranch
                          key={node.label.id}
                          node={node}
                          hasNestedLabels={false}
                          collapsed={collapsed}
                          activeLabelId={activeLabelId}
                          hrefFor={hrefFor}
                          onNavigate={onNavigate}
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
                  </SidebarGroupContent>
                </>
              )}

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
            </SidebarGroupContent>
          </>
        ) : null}
      </div>
      <nav className="flex shrink-0 flex-col gap-px pt-2">
        {team && (
          <NavRow
            href={team.href}
            onNavigate={onNavigate}
            active={false}
            icon={<Users2Icon className="size-4 shrink-0" />}
            name="Discussions"
            count={team.unreadCount}
            emphasizeCount
            collapsed={collapsed}
          />
        )}
        <NavRow
          onClick={onOpenSettings}
          onNavigate={onNavigate}
          active={false}
          icon={<SettingsIcon className="size-4 shrink-0" />}
          name="Settings"
          count={null}
          collapsed={collapsed}
        />
      </nav>
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
  | "onNavigate"
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
              <DisclosureChevron expanded={expanded} />
            </button>
          )}
          <NavRow
            href={props.hrefFor({ kind: "label", labelId: label.id })}
            onNavigate={props.onNavigate}
            active={props.activeLabelId === label.id}
            icon={
              collapsed ? (
                <TagIcon
                  className="size-4 shrink-0"
                  style={{ color: label.color?.backgroundColor ?? undefined }}
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
      {children.length > 0 && (
        <SidebarGroupContent
          open={expanded}
          className={collapsed ? undefined : "ml-2.5"}
        >
          {children.map((child) => (
            <LabelBranch
              key={child.label.id}
              node={child}
              hasNestedLabels={hasNestedLabels}
              collapsed={collapsed}
              {...props}
            />
          ))}
        </SidebarGroupContent>
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
          <DisclosureChevron expanded={expanded} />
        </button>
      ) : null}
    </div>
  );
}

function SidebarGroupContent({
  open,
  className,
  children,
}: {
  open: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Collapsible open={open}>
      {/* The inset padding keeps row focus rings clear of the clipping that
          the height animation needs. */}
      <CollapsibleContent
        className={cn(
          "-m-0.5 overflow-hidden p-0.5 data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down motion-reduce:animate-none",
          className,
        )}
      >
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function DisclosureChevron({ expanded }: { expanded?: boolean }) {
  return (
    <ChevronRightIcon
      className={cn(
        "size-3 shrink-0 transition-transform motion-reduce:transition-none",
        expanded && "rotate-90",
      )}
    />
  );
}

function NavRow({
  href,
  onClick,
  onNavigate,
  active,
  icon,
  name,
  count,
  emphasizeCount,
  nested,
  collapsed,
}: {
  href?: string;
  /** For rows that open something in place rather than navigating. */
  onClick?: () => void;
  onNavigate: () => void;
  active: boolean;
  icon: ReactNode;
  name: string;
  count: number | null;
  emphasizeCount?: boolean;
  nested?: boolean;
  collapsed?: boolean;
}) {
  const presentation = getMailSidebarRowPresentation({
    active,
    icon,
    name,
    count,
    emphasizeCount,
    nested,
    collapsed,
  });
  const className = cn(presentation.className);
  const content = presentation.content;

  let row: ReactNode;
  if (href) {
    row = (
      <Link
        href={href}
        onNavigate={onNavigate}
        aria-current={active ? "page" : undefined}
        className={className}
      >
        {content}
      </Link>
    );
  } else if (onClick) {
    row = (
      <button
        type="button"
        onClick={onClick}
        className={cn(className, "text-left")}
      >
        {content}
      </button>
    );
  } else {
    row = (
      <div aria-current={active ? "page" : undefined} className={className}>
        {content}
      </div>
    );
  }

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
