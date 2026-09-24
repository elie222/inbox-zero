"use client";

import { isThreadStarred } from "@/app/(app)/[emailAccountId]/mail/star-state";
import * as React from "react";
import {
  Loader2Icon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
  UsersIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { buildMailCommandPalette } from "@/app/(app)/[emailAccountId]/mail/mail-command-palette";
import { buildSnoozeCommandPalette } from "@/app/(app)/[emailAccountId]/mail/snooze-command-palette";
import { ShortcutsDialog } from "@/app/(app)/[emailAccountId]/mail/ShortcutsDialog";
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
  senderCommandContextAtom,
  shortcutsDialogOpenAtom,
} from "@/store/command-palette";
import type {
  MailCommandContext,
  SenderCommandContext,
} from "@/store/command-palette";
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
import { useThread } from "@/hooks/useThread";
import { useOptionalMailClient } from "@inboxzero/mail-react/MailEngineProvider";
import { mutationPayloadToChange } from "@/utils/mail-engine/mutation-change";
import { submitConversationChange } from "@/utils/mail-engine/submit-conversations";
import { admissionRejectionCopy } from "@/utils/mail-engine/admission-notice";
import { AccountCommandList } from "@/components/AccountCommandList";
import { toastError } from "@/components/Toast";
import { trackMailAction } from "@/utils/analytics/mail-usage";

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

/** Still shown in ⌘K when a conversation is selected and mail actions take over. */
const ALWAYS_VISIBLE_SHORTCUT_COMMANDS = new Set(["compose", "help"]);

// Mounted app-wide. It enables the mail scope everywhere so the side-panel email
// viewer keeps its triage keys on any page. That doesn't collide with the mail
// route's own bindings: these handlers are only defined when the side panel has a
// thread (`side-panel-thread-id`), which the mail list never sets — and the mail
// screen in turn stands down while the side panel is open.
export function CommandK() {
  return (
    <ShortcutsProvider scopes={MAIL_SHORTCUT_SCOPES}>
      <CommandPalette />
      <ShortcutsDialog />
    </ShortcutsProvider>
  );
}

function CommandPalette() {
  const mailCommandContext = useAtomValue(mailCommandContextAtom);
  const senderCommandContext = useAtomValue(senderCommandContextAtom);
  const displayedEmail = useDisplayedEmail();
  const activeMailContext = displayedEmail.threadId ? null : mailCommandContext;
  const senderContextMatchesTarget = Boolean(
    activeMailContext?.target &&
      senderCommandContext &&
      activeMailContext.target.emailAccountId ===
        senderCommandContext.emailAccountId &&
      activeMailContext.target.threadId === senderCommandContext.threadId,
  );

  return (
    <CommandPaletteContent
      displayedEmail={displayedEmail}
      mailCommandContext={activeMailContext}
      senderCommandContext={
        senderContextMatchesTarget ? senderCommandContext : null
      }
    />
  );
}

function CommandPaletteContent({
  displayedEmail,
  mailCommandContext,
  senderCommandContext,
}: {
  displayedEmail: ReturnType<typeof useDisplayedEmail>;
  mailCommandContext: MailCommandContext | null;
  senderCommandContext: SenderCommandContext | null;
}) {
  const [open, setOpen] = useAtom(commandPaletteOpenAtom);
  const setShortcutsOpen = useSetAtom(shortcutsDialogOpenAtom);
  const [activePage, setPage] = React.useState<"root" | "snooze" | "accounts">(
    "root",
  );
  const [search, setSearch] = React.useState("");
  const page =
    activePage === "snooze" && !mailCommandContext?.actions.snooze
      ? "root"
      : activePage;
  const { setTheme } = useTheme();

  const { emailAccountId } = useAccount();
  const client = useOptionalMailClient();
  const { threadId, showEmail } = displayedEmail;
  const { data: displayedThread, isLoading: isDisplayedThreadLoading } =
    useThread({ id: threadId });
  const { onOpen: onOpenComposeModal } = useComposeModal();
  const { commands, isLoading } = useCommandPaletteCommands({
    enabled: !mailCommandContext,
  });

  const shortcutHandlers: ShortcutHandlers = {
    commandPalette: () => {
      setPage("root");
      setSearch("");
      setOpen((wasOpen) => !wasOpen);
    },
    compose: onOpenComposeModal,
    help: () => setShortcutsOpen(true),
    archive: threadId
      ? async () => {
          if (displayedThread?.thread.id !== threadId) {
            toastError({
              description: isDisplayedThreadLoading
                ? "Email is still loading"
                : "Email is unavailable",
            });
            return;
          }
          try {
            const change = mutationPayloadToChange({ kind: "archive" });
            if (!client || !change) {
              throw new Error("Mail engine is unavailable");
            }
            const { admission } = await submitConversationChange({
              accountId: emailAccountId,
              change,
              client,
              conversationId: threadId,
            });
            if (admission.status === "rejected") {
              toastError({
                description:
                  admissionRejectionCopy(admission.code) ??
                  "Couldn't queue archiving this email",
              });
              return;
            }
            showEmail(null);
          } catch {
            toastError({
              description: "Couldn't queue archiving this email",
            });
          }
        }
      : undefined,
    star: threadId
      ? async () => {
          if (displayedThread?.thread.id !== threadId) {
            toastError({
              description: isDisplayedThreadLoading
                ? "Email is still loading"
                : "Email is unavailable",
            });
            return;
          }
          try {
            const change = mutationPayloadToChange({
              kind: "set_starred_state",
              starred: !isThreadStarred(displayedThread.thread.messages),
            });
            if (!client || !change) {
              throw new Error("Mail engine is unavailable");
            }
            const { admission } = await submitConversationChange({
              accountId: emailAccountId,
              change,
              client,
              conversationId: threadId,
            });
            if (admission.status === "rejected") {
              toastError({
                description:
                  admissionRejectionCopy(admission.code) ??
                  "Couldn’t update the star for this email",
              });
            }
          } catch {
            toastError({
              description: "Couldn’t update the star for this email",
            });
          }
        }
      : undefined,
    forward:
      threadId && displayedThread?.thread.id === threadId
        ? () => {
            const messageId = displayedThread.thread.messages.at(-1)?.id;
            if (!messageId) return;
            showEmail({
              threadId,
              autoOpenForwardForMessageId: messageId,
              showReplyButton: true,
            });
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
          forward: mailCommandContext.actions.forward,
          label: mailCommandContext.actions.label,
          star: mailCommandContext.actions.star,
          markRead: mailCommandContext.actions.markRead,
          markSpam: mailCommandContext.actions.markSpam,
          markUnread: mailCommandContext.actions.markUnread,
          move: mailCommandContext.actions.move,
          openSnooze: mailCommandContext.actions.snooze
            ? () => setPage("snooze")
            : undefined,
          trash: mailCommandContext.actions.trash,
          openExternal: mailCommandContext.actions.openExternal,
          toggleAutoArchive: senderCommandContext?.toggleAutoArchive,
          unsubscribe: senderCommandContext?.unsubscribe,
        },
        allStarred: mailCommandContext.allStarred,
        hasRead: mailCommandContext.hasRead,
        hasUnread: mailCommandContext.hasUnread,
        isAutoArchived: senderCommandContext?.isAutoArchived,
        isAutoArchiveDisabled: senderCommandContext?.isAutoArchiveDisabled,
        isUnsubscribeDisabled: senderCommandContext?.isUnsubscribeDisabled,
        unsubscribeLabel: senderCommandContext?.unsubscribeLabel,
        openExternalLabel: mailCommandContext.openExternalLabel,
        targetCount: mailCommandContext.targetCount,
      })
    : [];

  let allCommands: Command[];
  if (page === "snooze" && mailCommandContext?.actions.snooze) {
    allCommands = buildSnoozeCommandPalette({
      onSnooze: mailCommandContext.actions.snooze,
      query: search,
    });
  } else {
    const actionCommands = mailCommandContext
      ? [
          ...mailCommands,
          ...shortcutCommands.filter((command) =>
            ALWAYS_VISIBLE_SHORTCUT_COMMANDS.has(command.id),
          ),
        ]
      : shortcutCommands;
    const themeCommands: Command[] = [
      { theme: "dark", label: "Dark", icon: MoonIcon },
      { theme: "light", label: "Light", icon: SunIcon },
      { theme: "system", label: "System", icon: MonitorIcon },
    ].map(({ theme, label, icon }) => ({
      id: `theme-${theme}`,
      label: `Set Theme: ${label}`,
      icon,
      section: "settings",
      keywords: ["theme", "appearance", "mode", theme],
      action: () => setTheme(theme),
    }));
    allCommands = [
      ...actionCommands,
      {
        id: "switch-accounts",
        label: "Switch accounts",
        icon: UsersIcon,
        section: "accounts",
        keywords: ["switch", "accounts", "email", "inbox"],
        closeOnSelect: false,
        action: () => setPage("accounts"),
      },
      ...commands,
      ...themeCommands,
    ];
  }

  const filteredCommands =
    page === "snooze" || !search.trim()
      ? allCommands
      : fuzzySearch(search, allCommands);
  const groupedCommands = groupCommands(filteredCommands);

  const executeCommand = (command: Command) => {
    if (command.disabled) return;
    setSearch("");
    if (command.closeOnSelect !== false) {
      setOpen(false);
      setPage("root");
    }
    command.action();
    trackMailAction({ action: command.id, source: "palette" });
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
        if (page === "root") return;
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
          {
            root: "Type a command or search...",
            snooze: "When should it return? Try Friday at 3pm",
            accounts: "Search accounts...",
          }[page]
        }
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        {page === "accounts" ? (
          <AccountCommandList
            search={search}
            onClose={() => handleOpenChange(false)}
            onBack={() => {
              setPage("root");
              setSearch("");
            }}
          />
        ) : isLoading ? (
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
                        disabled={command.disabled}
                        onSelect={() => executeCommand(command)}
                      >
                        {command.icon && (
                          <command.icon className="mr-2 h-4 w-4" />
                        )}
                        <span className="flex-1">{command.label}</span>
                        {command.description && (
                          <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                            {command.description}
                          </span>
                        )}
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
