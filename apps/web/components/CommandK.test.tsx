// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShortcutHandlers } from "@/lib/shortcuts/registry";
import { CommandK } from "./CommandK";

const displayedEmail = vi.hoisted(() => ({
  showEmail: vi.fn(),
  threadId: "thread-1" as string | null,
}));
const thread = vi.hoisted(() => ({
  data: {
    thread: {
      id: "thread-1",
      messages: [{ id: "message-1" }, { id: "message-2" }],
    },
  } as { thread: { id: string; messages: { id: string }[] } } | undefined,
  isLoading: false,
}));
const outbox = vi.hoisted(() => ({ enqueue: vi.fn() }));
const notifications = vi.hoisted(() => ({ error: vi.fn() }));
const shortcuts = vi.hoisted(() => ({
  handlers: undefined as ShortcutHandlers | undefined,
}));

vi.mock("@/hooks/useDisplayedEmail", () => ({
  useDisplayedEmail: () => ({
    threadId: displayedEmail.threadId,
    showEmail: displayedEmail.showEmail,
  }),
}));
vi.mock("@/hooks/useThread", () => ({
  useThread: () => ({ data: thread.data, isLoading: thread.isLoading }),
}));
vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({ emailAccountId: "account-1" }),
}));
vi.mock("@/providers/ComposeModalProvider", () => ({
  useComposeModal: () => ({ onOpen: vi.fn() }),
}));
vi.mock("@/utils/email-cache/thread-mail-mutations", () => ({
  enqueueThreadMailMutationBatch: outbox.enqueue,
}));
vi.mock("@/components/Toast", () => ({ toastError: notifications.error }));
vi.mock("@/hooks/useCommandPaletteCommands", () => ({
  useCommandPaletteCommands: () => ({ commands: [], isLoading: false }),
}));
vi.mock("@/lib/shortcuts/useShortcuts", () => ({
  useShortcuts: (handlers: ShortcutHandlers) => {
    shortcuts.handlers = handlers;
  },
}));
vi.mock("@/lib/shortcuts/ShortcutsProvider", () => ({
  ShortcutsProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/lib/shortcuts/registry", () => ({
  buildShortcutPaletteCommands: () => [],
  MAIL_SHORTCUT_SCOPES: [],
}));
vi.mock("@/app/(app)/[emailAccountId]/mail/mail-command-palette", () => ({
  buildMailCommandPalette: () => [],
}));
vi.mock("@/app/(app)/[emailAccountId]/mail/snooze-command-palette", () => ({
  buildSnoozeCommandPalette: () => [],
}));
vi.mock("@/lib/commands/fuzzy-search", () => ({ fuzzySearch: () => [] }));
vi.mock("@/components/ui/command", () => ({
  CommandDialog: ({ children }: { children: React.ReactNode }) => children,
  CommandEmpty: () => null,
  CommandGroup: ({ children }: { children: React.ReactNode }) => children,
  CommandInput: () => null,
  CommandItem: ({ children }: { children: React.ReactNode }) => children,
  CommandList: ({ children }: { children: React.ReactNode }) => children,
  CommandSeparator: () => null,
  CommandShortcut: () => null,
}));

describe("CommandK side-panel archive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    displayedEmail.threadId = "thread-1";
    thread.data = {
      thread: {
        id: "thread-1",
        messages: [{ id: "message-1" }, { id: "message-2" }],
      },
    };
    thread.isLoading = false;
    outbox.enqueue.mockResolvedValue({ batchId: "batch", mutations: [] });
    shortcuts.handlers = undefined;
  });

  afterEach(cleanup);

  it("persists the complete thread snapshot before closing the viewer", async () => {
    const persisted = Promise.withResolvers<{
      batchId: string;
      mutations: never[];
    }>();
    outbox.enqueue.mockReturnValue(persisted.promise);
    render(<CommandK />);

    let archive: Promise<void> | undefined;
    act(() => {
      archive = shortcuts.handlers?.archive?.() as Promise<void> | undefined;
    });

    expect(outbox.enqueue).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      payload: { kind: "archive" },
      threads: [thread.data?.thread],
    });
    expect(displayedEmail.showEmail).not.toHaveBeenCalled();

    persisted.resolve({ batchId: "batch", mutations: [] });
    await act(async () => archive);
    expect(displayedEmail.showEmail).toHaveBeenCalledWith(null);
  });

  it("keeps the viewer open when durable storage fails", async () => {
    outbox.enqueue.mockRejectedValue(new Error("storage unavailable"));
    render(<CommandK />);

    await act(async () => shortcuts.handlers?.archive?.());

    expect(displayedEmail.showEmail).not.toHaveBeenCalled();
    expect(notifications.error).toHaveBeenCalledWith({
      description: "Couldn't queue archiving this email",
    });
  });

  it("keeps archive bound while the full thread snapshot is loading", async () => {
    thread.data = undefined;
    thread.isLoading = true;
    render(<CommandK />);

    expect(shortcuts.handlers?.archive).toBeTypeOf("function");

    await act(async () => shortcuts.handlers?.archive?.());

    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(displayedEmail.showEmail).not.toHaveBeenCalled();
    expect(notifications.error).toHaveBeenCalledWith({
      description: "Email is still loading",
    });
  });
});
