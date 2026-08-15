"use client";

import * as React from "react";
import { Loader2Icon } from "lucide-react";
import { useAtom, useAtomValue } from "jotai";
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
  const [open, setOpen] = useAtom(commandPaletteOpenAtom);
  const [search, setSearch] = React.useState("");
  const mailCommandContext = useAtomValue(mailCommandContextAtom);

  const { emailAccountId } = useAccount();
  const { threadId, showEmail } = useDisplayedEmail();
  const { onOpen: onOpenComposeModal } = useComposeModal();
  const activeMailContext = threadId ? null : mailCommandContext;
  const { commands, isLoading } = useCommandPaletteCommands({
    enabled: !activeMailContext,
  });

  const onArchive = React.useCallback(() => {
    if (threadId) {
      archiveEmails({ threadIds: [threadId], emailAccountId });
      showEmail(null);
    }
  }, [threadId, showEmail, emailAccountId]);

  const shortcutHandlers = React.useMemo<ShortcutHandlers>(
    () => ({
      commandPalette: () => setOpen((prev) => !prev),
      compose: onOpenComposeModal,
      archive: threadId ? onArchive : undefined,
      // While the palette is open, Escape belongs to the dialog.
      backToList: open || !threadId ? undefined : () => showEmail(null),
    }),
    [threadId, open, onArchive, onOpenComposeModal, showEmail, setOpen],
  );

  useShortcuts(shortcutHandlers);

  // the registry decides which shortcuts surface as palette entries
  const shortcutCommands = React.useMemo<Command[]>(
    () => buildShortcutPaletteCommands(shortcutHandlers),
    [shortcutHandlers],
  );

  const actionCommands = React.useMemo(
    () =>
      activeMailContext
        ? [
            ...activeMailContext.commands,
            ...shortcutCommands.filter((command) => command.id === "compose"),
          ]
        : shortcutCommands,
    [activeMailContext, shortcutCommands],
  );

  const allCommands = React.useMemo(
    () => [...actionCommands, ...commands],
    [actionCommands, commands],
  );

  const filteredCommands = React.useMemo(() => {
    if (!search.trim()) return allCommands;
    return fuzzySearch(search, allCommands);
  }, [allCommands, search]);

  const groupedCommands = React.useMemo(() => {
    const groups: Record<CommandSection, Command[]> = {
      actions: [],
      navigation: [],
      rules: [],
      accounts: [],
      settings: [],
    };

    for (const command of filteredCommands) {
      groups[command.section].push(command);
    }

    return groups;
  }, [filteredCommands]);

  const executeCommand = React.useCallback(
    (command: Command) => {
      setOpen(false);
      setSearch("");
      command.action();
    },
    [setOpen],
  );

  const handleOpenChange = React.useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      if (!isOpen) setSearch("");
    },
    [setOpen],
  );

  const commandProps = React.useMemo(
    () => ({
      // disable cmdk's built-in filter since we use custom fuzzy search
      shouldFilter: false,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key !== "Escape") e.stopPropagation();
      },
    }),
    [],
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      commandProps={commandProps}
    >
      <CommandInput
        placeholder="Type a command or search..."
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
            <CommandEmpty>No results found.</CommandEmpty>
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
                  <CommandGroup heading={SECTION_LABELS[section]}>
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
          close
        </span>
      </div>
    </CommandDialog>
  );
}
