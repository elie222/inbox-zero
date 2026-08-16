"use client";

import * as React from "react";
import { ArrowLeftIcon, Loader2Icon } from "lucide-react";
import { useAtom, useAtomValue } from "jotai";
import { buildMailCommandPalette } from "@/app/(app)/[emailAccountId]/mail/mail-command-palette";
import { buildSnoozeCommandPalette } from "@/app/(app)/[emailAccountId]/mail/snooze-command-palette";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useComposeModal } from "@/providers/ComposeModalProvider";
import {
  commandPaletteOpenAtom,
  mailCommandContextAtom,
} from "@/store/command-palette";
import type { MailCommandContext } from "@/store/command-palette";
import { archiveEmails } from "@/store/archive-queue";
import { useDisplayedEmail } from "@/hooks/useDisplayedEmail";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useCommandPaletteCommands } from "@/hooks/useCommandPaletteCommands";
import { fuzzySearch } from "@/lib/commands/fuzzy-search";
import type { Command, CommandSection } from "@/lib/commands/types";
import { ShortcutsProvider } from "@/lib/shortcuts/ShortcutsProvider";
import { useShortcuts } from "@/lib/shortcuts/useShortcuts";
import {
  buildShortcutPaletteCommands,
  MAIL_SHORTCUT_SCOPES,
  type ShortcutHandlers,
} from "@/lib/shortcuts/registry";

const SECTION_ORDER: CommandSection[] = [
  "actions",
  "navigation",
  "rules",
  "accounts",
  "settings",
];

const SECTION_LABELS: Record<CommandSection, string> = {
  actions: "Actions",
  navigation: "Navigation",
  rules: "Rules",
  accounts: "Switch Account",
  settings: "Settings",
};

// Mounted app-wide. It enables the mail scope everywhere so the side-panel email
// viewer keeps its triage keys on any page. That doesn't collide with the mail
// route's own bindings: these handlers are only defined when the side panel has a
// thread (`side-panel-thread-id`), which the mail list never sets — and the mail
// screen in turn stands down while the side panel is open.
export function CommandK() {
  return (
    <ShortcutsProvider scopes={MAIL_SHORTCUT_SCOPES}>
      <CommandPalette />
    </ShortcutsProvider>
  );
}

function CommandPalette() {
  const mailCommandContext = useAtomValue(mailCommandContextAtom);
  const displayedEmail = useDisplayedEmail();
  const activeMailContext = displayedEmail.threadId ? null : mailCommandContext;

  return (
    <CommandPaletteContent
      key={activeMailContext ? "mail" : "default"}
      displayedEmail={displayedEmail}
      mailCommandContext={activeMailContext}
    />
  );
}

function CommandPaletteContent({
  displayedEmail,
  mailCommandContext,
}: {
  displayedEmail: ReturnType<typeof useDisplayedEmail>;
  mailCommandContext: MailCommandContext | null;
}) {
  const [open, setOpen] = useAtom(commandPaletteOpenAtom);
  const [page, setPage] = React.useState<"root" | "snooze">("root");
  const [search, setSearch] = React.useState("");

  const { emailAccountId } = useAccount();
  const { threadId, showEmail } = displayedEmail;
  const { onOpen: onOpenComposeModal } = useComposeModal();
  const { commands, isLoading } = useCommandPaletteCommands({
    enabled: !mailCommandContext,
  });

  const shortcutHandlers: ShortcutHandlers = {
    commandPalette: () => setOpen((wasOpen) => !wasOpen),
    compose: onOpenComposeModal,
    archive: threadId
      ? () => {
          archiveEmails({ threadIds: [threadId], emailAccountId });
          showEmail(null);
        }
      : undefined,
    snooze: mailCommandContext?.actions.snooze
      ? () => {
          setSearch("");
          setPage("snooze");
          setOpen(true);
        }
      : undefined,
    // While the palette is open, Escape belongs to the dialog.
    backToList: open || !threadId ? undefined : () => showEmail(null),
  };

  useShortcuts(shortcutHandlers);

  const shortcutCommands = buildShortcutPaletteCommands(shortcutHandlers);
  const mailCommands = mailCommandContext
    ? buildMailCommandPalette({
        actions: {
          archive: mailCommandContext.actions.archive,
          markRead: mailCommandContext.actions.markRead,
          markUnread: mailCommandContext.actions.markUnread,
          openSnooze: mailCommandContext.actions.snooze
            ? () => setPage("snooze")
            : undefined,
          trash: mailCommandContext.actions.trash,
        },
        hasRead: mailCommandContext.hasRead,
        hasUnread: mailCommandContext.hasUnread,
        targetCount: mailCommandContext.targetCount,
      })
    : [];

  let allCommands: Command[];
  if (page === "snooze" && mailCommandContext?.actions.snooze) {
    const snoozeCommands = buildSnoozeCommandPalette({
      onSnooze: mailCommandContext.actions.snooze,
      query: search,
    });
    allCommands = search.trim()
      ? snoozeCommands
      : [
          {
            id: "mail-snooze-back",
            label: "Back to commands",
            icon: ArrowLeftIcon,
            section: "actions",
            priority: -1,
            closeOnSelect: false,
            action: () => setPage("root"),
          },
          ...snoozeCommands,
        ];
  } else {
    const actionCommands = mailCommandContext
      ? [
          ...mailCommands,
          ...shortcutCommands.filter((command) => command.id === "compose"),
        ]
      : shortcutCommands;
    allCommands = [...actionCommands, ...commands];
  }

  const filteredCommands =
    page === "snooze" || !search.trim()
      ? allCommands
      : fuzzySearch(search, allCommands);
  const groupedCommands = groupCommands(filteredCommands);

  const executeCommand = (command: Command) => {
    setSearch("");
    if (command.closeOnSelect !== false) {
      setOpen(false);
      setPage("root");
    }
    command.action();
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setPage("root");
      setSearch("");
    }
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      onEscapeKeyDown={(event) => {
        if (page !== "snooze") return;
        event.preventDefault();
        setPage("root");
        setSearch("");
      }}
      commandProps={{
        // Disable cmdk's built-in filter since we use custom fuzzy search.
        shouldFilter: false,
        onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
          if (event.key !== "Escape") event.stopPropagation();
        },
      }}
    >
      <CommandInput
        key={page}
        autoFocus
        placeholder={
          page === "snooze"
            ? "When should it return? Try Friday at 3pm"
            : "Type a command or search..."
        }
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2Icon className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <CommandEmpty>
              {page === "snooze"
                ? "Try a date like tomorrow at 3pm."
                : "No results found."}
            </CommandEmpty>
            {SECTION_ORDER.map((section, index) => {
              const sectionCommands = groupedCommands[section];
              if (sectionCommands.length === 0) return null;

              const showSeparator =
                index > 0 &&
                SECTION_ORDER.slice(0, index).some(
                  (s) => groupedCommands[s].length > 0,
                );

              return (
                <React.Fragment key={section}>
                  {showSeparator && <CommandSeparator />}
                  <CommandGroup
                    heading={
                      page === "snooze" && section === "actions"
                        ? "Snooze until"
                        : SECTION_LABELS[section]
                    }
                  >
                    {sectionCommands.map((command) => (
                      <CommandItem
                        key={command.id}
                        value={`${command.id} ${command.label} ${command.keywords?.join(" ") || ""}`}
                        onSelect={() => executeCommand(command)}
                      >
                        {command.icon && (
                          <command.icon className="mr-2 h-4 w-4" />
                        )}
                        <span className="flex-1">{command.label}</span>
                        {command.shortcut && (
                          <CommandShortcut>{command.shortcut}</CommandShortcut>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </React.Fragment>
              );
            })}
          </>
        )}
      </CommandList>
      <div className="flex items-center justify-center gap-4 border-t px-3 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            ↑↓
          </kbd>
          navigate
        </span>
        <span className="flex items-center gap-1">
          <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            ↵
          </kbd>
          select
        </span>
        <span className="flex items-center gap-1">
          <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            esc
          </kbd>
          {page === "snooze" ? "back" : "close"}
        </span>
      </div>
    </CommandDialog>
  );
}

function groupCommands(commands: Command[]) {
  const groups: Record<CommandSection, Command[]> = {
    actions: [],
    navigation: [],
    rules: [],
    accounts: [],
    settings: [],
  };

  for (const command of commands) groups[command.section].push(command);

  return groups;
}
