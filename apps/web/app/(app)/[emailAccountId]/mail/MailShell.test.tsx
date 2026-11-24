// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MailboxThreadList } from "@inboxzero/mail-ui/MailboxSurface";
import { MailLayout, MailSetupState } from "@/generated/prisma/enums";
import { MailShell } from "./MailShell";

(globalThis as { React?: typeof React }).React = React;

const mockState = vi.hoisted(() => ({
  isMobile: false as boolean | undefined,
  settingsLayout: "SPLIT" as "LIST" | "SPLIT",
  setupParam: null as string | null,
  searchParam: null as string | null,
  forceMenuOpen: false,
  isLoadingThreads: false,
  threads: [] as Array<{
    id: string;
    messages: Array<{
      id: string;
      threadId: string;
      labelIds: string[];
      date: Date;
      headers: {
        subject: string;
        from: string;
        to: string;
        date: string;
      };
    }>;
  }>,
  shortcutHandlers: {} as Record<string, (() => void) | undefined>,
  updatePreferences: vi.fn().mockResolvedValue({ data: {} }),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => !!mockState.isMobile,
  useIsMobileState: () => mockState.isMobile,
}));

vi.mock("@/hooks/useMailSettings", () => ({
  useMailSettings: () => ({
    data: {
      layout:
        mockState.settingsLayout === "SPLIT"
          ? MailLayout.SPLIT
          : MailLayout.LIST,
      expandedPreview: false,
      bundleInbox: false,
      setup: MailSetupState.DONE,
      defaultSplitId: "all",
      splits: [],
    },
    mutate: vi.fn(),
  }),
}));

vi.mock("@/providers/EmailAccountProvider", () => ({
  EmailAccountScopeProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useAccount: () => ({
    emailAccountId: "account-1",
    userEmail: "me@example.com",
    provider: "google",
    emailAccount: {
      id: "account-1",
      email: "me@example.com",
      name: "Me",
      image: null,
      account: { provider: "google", disconnectedAt: null },
    },
  }),
}));

vi.mock("@/hooks/useAccounts", () => ({
  useAccounts: () => ({ data: { emailAccounts: [] } }),
}));

vi.mock("@/providers/EmailLabelsProvider", () => ({
  useEmailLabels: () => ({ userLabels: [] }),
}));

vi.mock("@/hooks/useLabels", () => ({
  useLabels: () => ({ userLabels: [] }),
}));

vi.mock("@/hooks/useFolders", () => ({
  useFolders: () => ({ folders: [] }),
}));

vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({ toggleSidebar: vi.fn(), state: "" }),
}));

vi.mock("@/hooks/useDisplayedEmail", () => ({
  useDisplayedEmail: () => ({ threadId: undefined }),
}));

vi.mock("@/hooks/useHiddenDraftMessageIds", () => ({
  useHiddenDraftMessageIds: () => [],
}));

vi.mock("@/hooks/useThread", () => ({
  useThread: ({ id }: { id: string | null }) => ({
    data: id
      ? {
          thread: {
            id,
            messages: [
              {
                id: "msg-1",
                threadId: id,
                labelIds: ["INBOX"],
                date: new Date("2026-01-01T00:00:00Z"),
                headers: {
                  subject: "Mobile test subject",
                  from: "sender@example.com",
                  to: "me@example.com",
                  date: "2026-01-01T00:00:00Z",
                },
              },
            ],
          },
        }
      : undefined,
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
    localAvailability: undefined,
  }),
}));

vi.mock("@/providers/ChatProvider", () => ({
  useChat: () => ({
    setAmbientContext: vi.fn(),
    setMailView: vi.fn(),
    setMailScreenActionHandler: vi.fn(),
  }),
}));

vi.mock("@inboxzero/mail-react/MailEngineProvider", () => ({
  useOptionalMailClient: () => null,
}));

vi.mock("@inboxzero/mail-ui/MailProductFrame", () => ({
  MailProductFrame: ({
    children,
    dialogs,
    floating,
  }: {
    children: React.ReactNode;
    dialogs?: React.ReactNode;
    floating?: React.ReactNode;
  }) => (
    <div>
      {dialogs}
      {floating}
      {children}
    </div>
  ),
}));

vi.mock("nuqs", () => {
  const stringParser = {
    withDefault: () => stringParser,
  };
  return {
    parseAsString: stringParser,
    useQueryStates: (config: Record<string, unknown>) => {
      const [state, setState] = React.useState<Record<string, string | null>>(
        () => Object.fromEntries(Object.keys(config).map((key) => [key, null])),
      );
      const setQuery = React.useCallback(
        (patch: Record<string, string | null>) => {
          setState((prev) => ({ ...prev, ...patch }));
        },
        [],
      );
      return [state, setQuery] as const;
    },
    useQueryState: (key: string) => {
      const initial =
        key === "setup"
          ? mockState.setupParam
          : key === "q"
            ? mockState.searchParam
            : null;
      return React.useState<string | null>(initial);
    },
  };
});

vi.mock("@/app/(app)/[emailAccountId]/mail/use-mail-threads", () => ({
  useMailThreads: () => ({
    threads: mockState.threads,
    isLoading: mockState.isLoadingThreads,
    error: undefined,
    hasMore: false,
    isLoadingMore: false,
    loadMore: vi.fn(),
    refetch: vi.fn(),
    isSyncing: false,
  }),
}));

vi.mock("@/app/(app)/[emailAccountId]/mail/use-combined-mail-threads", () => ({
  useCombinedMailThreads: () => ({
    threads: [],
    labelsByAccount: new Map(),
    failedAccountIds: [],
    isLoading: false,
    error: undefined,
    hasMore: false,
    isLoadingMore: false,
    loadMore: vi.fn(),
    refetch: vi.fn(),
    isSyncing: false,
  }),
}));

vi.mock("@/app/(app)/[emailAccountId]/mail/use-optimistic-archive", () => ({
  useOptimisticArchive: (threads: unknown[]) => ({
    threads,
    archive: vi.fn(),
  }),
}));

vi.mock("@/app/(app)/[emailAccountId]/mail/use-thread-actions", () => ({
  useThreadActions: () => ({
    applyLabel: vi.fn(),
    archive: vi.fn(),
    moveToFolder: vi.fn(),
    moveToInbox: vi.fn(),
    trash: vi.fn(),
    markSpam: vi.fn(),
    setReadState: vi.fn(),
    setStarredState: vi.fn(),
    snooze: vi.fn(),
    undo: vi.fn(),
    waitForPendingUndoable: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@/app/(app)/[emailAccountId]/mail/use-warm-neighbour-threads", () => ({
  useWarmNeighbourThreads: () => vi.fn(),
}));

vi.mock(
  "@/app/(app)/[emailAccountId]/mail/use-mail-performance-telemetry",
  () => ({
    useMailPerformanceTelemetry: vi.fn(),
  }),
);

vi.mock("@/app/(app)/[emailAccountId]/mail/use-thread-translation", () => ({
  useTranslateThread: () => vi.fn(),
}));

vi.mock("@/lib/shortcuts/useShortcuts", () => ({
  useShortcuts: (handlers: Record<string, (() => void) | undefined>) => {
    mockState.shortcutHandlers = handlers;
  },
}));

vi.mock("@/utils/prisma", () => ({
  default: {},
}));

vi.mock("@/utils/redis", () => ({
  redis: {},
}));

vi.mock("@/utils/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/utils/actions/mail-split", () => ({
  updateMailPreferencesAction: (...args: unknown[]) =>
    mockState.updatePreferences(...args),
}));

vi.mock("@/components/team-comments/use-team-comments-available", () => ({
  useTeamCommentsAvailable: () => false,
}));

vi.mock("@/utils/mail-engine/MailEngineConnectionBanner", () => ({
  MailEngineConnectionBanner: () => null,
}));

vi.mock("@/components/ui/dropdown-menu", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/ui/dropdown-menu")>();
  return {
    ...actual,
    DropdownMenu: (props: React.ComponentProps<typeof actual.DropdownMenu>) =>
      mockState.forceMenuOpen ? (
        <actual.DropdownMenu {...props} modal={false} open />
      ) : (
        <actual.DropdownMenu {...props} modal={false} />
      ),
  };
});

vi.mock("@/app/(app)/[emailAccountId]/mail/MailShellSidebar", () => ({
  MailShellSidebar: () => <div data-testid="mail-sidebar" />,
}));

vi.mock("@/app/(app)/[emailAccountId]/mail/MailSplitTabs", () => ({
  MailSplitTabs: () => null,
}));

vi.mock("@/app/(app)/[emailAccountId]/mail/MailSetupPanel", () => ({
  MailSetupPanel: ({ layout }: { layout: string }) => (
    <div data-testid="mail-setup" data-layout={layout} />
  ),
}));

vi.mock("@/app/(app)/[emailAccountId]/mail/ScheduledEmailList", () => ({
  ScheduledEmailList: () => null,
}));

vi.mock("@/app/(app)/[emailAccountId]/mail/ListSenderCommands", () => ({
  ListSenderCommands: () => null,
}));

vi.mock("@/app/(app)/[emailAccountId]/mail/LabelPickerDialog", () => ({
  LabelPickerDialog: () => null,
}));

vi.mock("@/app/(app)/[emailAccountId]/mail/SplitPickerDialog", () => ({
  SplitPickerDialog: () => null,
}));

vi.mock("@/app/(app)/[emailAccountId]/mail/MailPreviewOverlay", () => ({
  MailPreviewOverlay: () => null,
}));

vi.mock("@/app/(app)/[emailAccountId]/mail/InboxZeroCelebration", () => ({
  InboxZeroCelebration: () => null,
}));

vi.mock("@/app/(app)/[emailAccountId]/mail/ThreadList", () => ({
  ThreadList: ({
    threads,
    layout,
    focusedIndex,
    onOpenThread,
    restoreFocusKey,
    onFocusRestored,
  }: {
    threads: Array<{ id: string }>;
    layout: string;
    focusedIndex: number;
    onOpenThread: (index: number) => void;
    restoreFocusKey?: string | null;
    onFocusRestored?: () => void;
  }) => (
    <div data-testid="thread-list" data-layout={layout}>
      <MailboxThreadList
        focusedIndex={focusedIndex}
        getKey={(thread) => thread.id}
        isLoadingMore={false}
        isSelected={() => false}
        items={threads}
        listKey="inbox"
        onFocusRestored={onFocusRestored}
        onLoadMore={() => {}}
        onOpen={onOpenThread}
        onSelectRangeTo={() => {}}
        onToggleSelect={() => {}}
        renderItem={(row) => (
          <div
            aria-selected={row.isSelected}
            key={row.rowKey}
            onClick={() => row.onOpen(row.index)}
            onKeyDown={(event) => {
              if (event.key === "Enter") row.onOpen(row.index);
            }}
            ref={row.rowRef}
            role="option"
            tabIndex={row.isFocused ? 0 : -1}
          >
            Open {row.item.id}
          </div>
        )}
        restoreFocusKey={restoreFocusKey}
        selectedCount={0}
        showLoadMore={false}
      />
    </div>
  ),
}));

vi.mock("@/app/(app)/[emailAccountId]/mail/MailReaderPane", () => ({
  MailReaderPane: ({
    layout,
    threadId,
    dataReady,
    readerKey,
    onReady,
    onClose,
  }: {
    layout: string;
    threadId: string | null;
    dataReady?: boolean;
    readerKey?: string;
    onReady?: (key: string) => void;
    onClose: () => void;
  }) => {
    React.useEffect(() => {
      if (dataReady && readerKey) onReady?.(readerKey);
    }, [dataReady, onReady, readerKey]);

    return (
      <div data-testid="mail-reader" data-layout={layout}>
        {threadId ? (
          <>
            <span>Reading {threadId}</span>
            <button type="button" onClick={onClose}>
              Back
            </button>
          </>
        ) : (
          <span>Nothing selected</span>
        )}
      </div>
    );
  },
}));

describe("MailShell mobile layout", () => {
  beforeEach(() => {
    mockState.isMobile = false;
    mockState.settingsLayout = "SPLIT";
    mockState.setupParam = null;
    mockState.searchParam = null;
    mockState.forceMenuOpen = false;
    mockState.isLoadingThreads = false;
    mockState.threads = [
      createMockThread("thread-1"),
      createMockThread("thread-2"),
    ];
    mockState.shortcutHandlers = {};
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("keeps split view on desktop when split layout is preferred", () => {
    mockState.forceMenuOpen = true;
    render(<MailShell />);

    expect(screen.getByTestId("thread-list").getAttribute("data-layout")).toBe(
      "split",
    );
    expect(screen.getByTestId("mail-reader").getAttribute("data-layout")).toBe(
      "split",
    );
    expect(screen.getByText("Nothing selected")).toBeTruthy();
    expect(
      screen.getByRole("separator", { name: "Resize email list" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("menuitemcheckbox", { name: /^Split view/ }),
    ).toBeTruthy();
    expect(mockState.shortcutHandlers.toggleLayout).toBeTypeOf("function");
  });

  it("avoids rendering split panes while viewport detection is unresolved even when split layout is preferred", () => {
    mockState.isMobile = undefined;
    mockState.setupParam = "1";
    mockState.forceMenuOpen = true;
    const { rerender } = render(<MailShell />);

    expect(screen.getByTestId("thread-list").getAttribute("data-layout")).toBe(
      "list",
    );
    expect(screen.queryByTestId("mail-reader")).toBeNull();
    expect(screen.queryByText("Nothing selected")).toBeNull();
    expect(
      screen.queryByRole("separator", { name: "Resize email list" }),
    ).toBeNull();
    expect(
      screen.queryByRole("menuitemcheckbox", { name: /^Split view/ }),
    ).toBeNull();
    expect(mockState.shortcutHandlers.toggleLayout).toBeUndefined();
    expect(screen.getByTestId("mail-setup").getAttribute("data-layout")).toBe(
      "split",
    );

    mockState.isMobile = true;
    rerender(<MailShell />);
    expect(screen.getByTestId("thread-list").getAttribute("data-layout")).toBe(
      "list",
    );
    expect(screen.queryByTestId("mail-reader")).toBeNull();

    mockState.isMobile = false;
    rerender(<MailShell />);
    expect(screen.getByTestId("thread-list").getAttribute("data-layout")).toBe(
      "split",
    );
    expect(screen.getByTestId("mail-reader").getAttribute("data-layout")).toBe(
      "split",
    );
    expect(
      screen.getByRole("separator", { name: "Resize email list" }),
    ).toBeTruthy();
    expect(mockState.shortcutHandlers.toggleLayout).toBeTypeOf("function");
  });

  it("uses full-screen list and reader navigation on mobile even when split layout is preferred", () => {
    mockState.isMobile = true;
    mockState.setupParam = "1";
    mockState.forceMenuOpen = true;
    render(<MailShell />);

    const threadList = screen.getByTestId("thread-list");
    expect(threadList.getAttribute("data-layout")).toBe("list");
    expect(screen.queryByTestId("mail-reader")).toBeNull();
    expect(screen.queryByText("Nothing selected")).toBeNull();
    expect(
      screen.queryByRole("separator", { name: "Resize email list" }),
    ).toBeNull();
    expect(
      screen.queryByRole("menuitemcheckbox", { name: /^Split view/ }),
    ).toBeNull();
    expect(mockState.shortcutHandlers.toggleLayout).toBeUndefined();
    expect(screen.getByTestId("mail-setup").getAttribute("data-layout")).toBe(
      "split",
    );

    act(() => {
      fireEvent.click(screen.getByRole("option", { name: "Open thread-1" }));
    });

    expect(screen.queryByTestId("thread-list")).toBeNull();
    expect(screen.getByTestId("mail-reader").getAttribute("data-layout")).toBe(
      "list",
    );
    expect(screen.getByText("Reading thread-1")).toBeTruthy();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
    });

    expect(screen.queryByTestId("mail-reader")).toBeNull();
    expect(screen.getByTestId("thread-list").getAttribute("data-layout")).toBe(
      "list",
    );
  });

  it("restores focus to the previously opened row when closing the mobile reader via Back or Escape", () => {
    mockState.isMobile = true;
    render(<MailShell />);

    act(() => {
      fireEvent.click(screen.getByRole("option", { name: "Open thread-2" }));
    });

    expect(screen.queryByTestId("thread-list")).toBeNull();
    expect(screen.getByText("Reading thread-2")).toBeTruthy();

    const backButton = screen.getByRole("button", { name: "Back" });
    backButton.focus();
    act(() => {
      fireEvent.click(backButton);
    });

    expect(screen.queryByTestId("mail-reader")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: "Open thread-2" }),
    );

    act(() => {
      fireEvent.click(screen.getByRole("option", { name: "Open thread-2" }));
    });
    expect(screen.getByText("Reading thread-2")).toBeTruthy();

    act(() => {
      mockState.shortcutHandlers.backToList?.();
    });

    expect(screen.queryByTestId("mail-reader")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: "Open thread-2" }),
    );
  });

  it("falls back to list-level focus when the previously opened row is removed before closing the reader", () => {
    mockState.isMobile = true;
    const { rerender } = render(<MailShell />);

    act(() => {
      fireEvent.click(screen.getByRole("option", { name: "Open thread-2" }));
    });
    expect(screen.getByText("Reading thread-2")).toBeTruthy();

    mockState.threads = [createMockThread("thread-1")];
    rerender(<MailShell />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
    });

    expect(screen.queryByTestId("mail-reader")).toBeNull();
    expect(screen.queryByRole("option", { name: "Open thread-2" })).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("listbox", { name: "Conversations" }),
    );

    act(() => {
      fireEvent.click(screen.getByRole("option", { name: "Open thread-1" }));
    });
    mockState.threads = [];
    rerender(<MailShell />);

    act(() => {
      mockState.shortcutHandlers.backToList?.();
    });

    const listRoot = screen.getByTestId("thread-list");
    expect(document.activeElement).not.toBe(document.body);
    expect(listRoot.contains(document.activeElement)).toBe(true);
  });

  it("keeps focus on the search input when closing the mobile reader via the search shortcut", () => {
    mockState.isMobile = true;
    render(<MailShell />);

    act(() => {
      fireEvent.click(screen.getByRole("option", { name: "Open thread-2" }));
    });
    expect(screen.getByText("Reading thread-2")).toBeTruthy();

    act(() => {
      mockState.shortcutHandlers.search?.();
    });

    expect(screen.queryByTestId("mail-reader")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("combobox", { name: "Search mail" }),
    );
  });

  it("clears pending list focus when the search query changes while the list is loading", () => {
    vi.useFakeTimers();
    mockState.isMobile = true;
    const { rerender } = render(<MailShell />);

    act(() => {
      fireEvent.click(screen.getByRole("option", { name: "Open thread-2" }));
    });
    expect(screen.getByText("Reading thread-2")).toBeTruthy();

    mockState.threads = [];
    mockState.isLoadingThreads = true;
    rerender(<MailShell />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
    });
    expect(screen.queryByTestId("mail-reader")).toBeNull();
    expect(screen.queryByTestId("thread-list")).toBeNull();

    const searchInput = screen.getByRole("combobox", { name: "Search mail" });
    searchInput.focus();
    act(() => {
      fireEvent.change(searchInput, { target: { value: "invoice" } });
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });
    mockState.isLoadingThreads = false;
    mockState.threads = [
      createMockThread("thread-1"),
      createMockThread("thread-2"),
    ];
    rerender(<MailShell />);

    expect(screen.getByTestId("thread-list")).toBeTruthy();
    expect(document.activeElement).toBe(searchInput);
  });

  it("preserves list focus restoration on reader close when an active search query does not change", () => {
    mockState.isMobile = true;
    mockState.searchParam = "invoice";
    render(<MailShell />);

    act(() => {
      fireEvent.click(screen.getByRole("option", { name: "Open thread-2" }));
    });
    expect(screen.getByText("Reading thread-2")).toBeTruthy();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
    });

    expect(screen.queryByTestId("mail-reader")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: "Open thread-2" }),
    );
  });

  it("syncs focusedIndex when the list reloads with the restored thread at a different index", () => {
    mockState.isMobile = true;
    const { rerender } = render(<MailShell />);

    act(() => {
      fireEvent.click(screen.getByRole("option", { name: "Open thread-2" }));
    });
    expect(screen.getByText("Reading thread-2")).toBeTruthy();

    mockState.threads = [];
    mockState.isLoadingThreads = true;
    rerender(<MailShell />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
    });
    expect(screen.queryByTestId("mail-reader")).toBeNull();
    expect(screen.queryByTestId("thread-list")).toBeNull();

    mockState.isLoadingThreads = false;
    mockState.threads = [
      createMockThread("thread-0"),
      createMockThread("thread-1"),
      createMockThread("thread-2"),
    ];
    rerender(<MailShell />);

    const thread2Row = screen.getByRole("option", { name: "Open thread-2" });
    expect(document.activeElement).toBe(thread2Row);
    expect(thread2Row.tabIndex).toBe(0);
    expect(screen.getByRole("option", { name: "Open thread-1" }).tabIndex).toBe(
      -1,
    );

    act(() => {
      mockState.shortcutHandlers.open?.();
    });
    expect(screen.getByText("Reading thread-2")).toBeTruthy();
  });
});

function createMockThread(id: string) {
  return {
    id,
    messages: [
      {
        id: `msg-${id}`,
        threadId: id,
        labelIds: ["INBOX"],
        date: new Date("2026-01-01T00:00:00Z"),
        headers: {
          subject: `Subject ${id}`,
          from: "sender@example.com",
          to: "me@example.com",
          date: "2026-01-01T00:00:00Z",
        },
      },
    ],
  };
}
