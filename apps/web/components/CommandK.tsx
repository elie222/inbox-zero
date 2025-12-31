"use client";

import * as React from "react";
import { ArchiveIcon, Loader2Icon, PenLineIcon } from "lucide-react";
import { useAtomValue } from "jotai";
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
import { refetchEmailListAtom } from "@/store/email";
import { archiveEmails } from "@/store/archive-queue";
import { useDisplayedEmail } from "@/hooks/useDisplayedEmail";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useCommandPaletteCommands } from "@/hooks/useCommandPaletteCommands";
import { useCommandPaletteEnabled } from "@/hooks/useFeatureFlags";
import { fuzzySearch } from "@/lib/commands/fuzzy-search";
import type { Command, CommandSection } from "@/lib/commands/types";

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

export function CommandK() {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const { emailAccountId } = useAccount();
  const { threadId, showEmail } = useDisplayedEmail();
  const refreshEmailList = useAtomValue(refetchEmailListAtom);
  const { onOpen: onOpenComposeModal } = useComposeModal();
  const { commands, isLoading } = useCommandPaletteCommands();
  const isEnabled = useCommandPaletteEnabled();

  const onArchive = React.useCallback(() => {
    if (threadId) {
      const threadIds = [threadId];
      archiveEmails({
        threadIds,
        onSuccess: () => {
          return refreshEmailList?.refetch({ removedThreadIds: threadIds });
        },
        emailAccountId,
      });
      showEmail(null);
    }
  }, [refreshEmailList, threadId, showEmail, emailAccountId]);

  // build action commands that include archive and compose
  const actionCommands = React.useMemo<Command[]>(() => {
    const actions: Command[] = [
      {
        id: "compose",
        label: "Compose",
        description: "Write a new email",
        icon: PenLineIcon,
        shortcut: "C",
        section: "actions",
        priority: 1,
        keywords: ["write", "new", "email", "draft"],
        action: () => onOpenComposeModal(),
      },
    ];

    if (threadId) {
      actions.unshift({
        id: "archive",
        label: "Archive",
        description: "Archive current email",
        icon: ArchiveIcon,
        shortcut: "E",
        section: "actions",
        priority: 0,
        keywords: ["archive", "remove", "delete"],
        action: () => onArchive(),
      });
    }

    return actions;
  }, [threadId, onArchive, onOpenComposeModal]);

  // combine action commands with dynamic commands
  const allCommands = React.useMemo(() => {
    return [...actionCommands, ...commands];
  }, [actionCommands, commands]);

  // filter commands with fuzzy search
  const filteredCommands = React.useMemo(() => {
    if (!search.trim()) {
      return allCommands;
    }
    return fuzzySearch(search, allCommands);
  }, [allCommands, search]);

  // group commands by section
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

  // execute command
  const executeCommand = React.useCallback((command: Command) => {
    setOpen(false);
    setSearch("");
    command.action();
  }, []);

  // keyboard shortcuts
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // cmd+k to toggle palette
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }

      // don't handle other shortcuts when palette is open
      if (open) return;

      // escape to close email preview
      if (e.key === "Escape") {
        if (threadId) {
          e.preventDefault();
          showEmail(null);
        }
        return;
      }

      // only handle shortcuts when focus is on body
      if (document?.activeElement?.tagName !== "BODY") return;

      // e for archive
      if ((e.key === "e" || e.key === "E") && !(e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onArchive();
        return;
      }

      // c for compose
      if ((e.key === "c" || e.key === "C") && !(e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenComposeModal();
        return;
      }
    };

    // listen for custom event from search button
    const openFromEvent = () => setOpen(true);

    document.addEventListener("keydown", down);
    window.addEventListener("open-command-palette", openFromEvent);

    return () => {
      document.removeEventListener("keydown", down);
      window.removeEventListener("open-command-palette", openFromEvent);
    };
  }, [open, onArchive, onOpenComposeModal, threadId, showEmail]);

  // don't render if feature disabled
  if (!isEnabled) {
    return null;
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) setSearch("");
      }}
      commandProps={{
        onKeyDown: (e) => {
          if (e.key !== "Escape") {
            e.stopPropagation();
          }
        },
      }}
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
                        <div className="flex flex-1 flex-col">
                          <span>{command.label}</span>
                          {command.description && (
                            <span className="text-xs text-muted-foreground">
                              {command.description}
                            </span>
                          )}
                        </div>
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
