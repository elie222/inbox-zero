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
import { MailLayout, MailSetupState } from "@/generated/prisma/enums";
import { MailShell } from "./MailShell";

(globalThis as { React?: typeof React }).React = React;

const mockState = vi.hoisted(() => ({
  isMobile: false,
  settingsLayout: "SPLIT" as "LIST" | "SPLIT",
  setupParam: null as string | null,
  forceMenuOpen: false,
  shortcutHandlers: {} as Record<string, unknown>,
  updatePreferences: vi.fn().mockResolvedValue({ data: {} }),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => mockState.isMobile,
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
      const initial = key === "setup" ? mockState.setupParam : null;
      return React.useState<string | null>(initial);
    },
  };
});

vi.mock("@/app/(app)/[emailAccountId]/mail/use-mail-threads", () => ({
  useMailThreads: () => ({
    threads: [
      {
        id: "thread-1",
        messages: [
          {
            id: "msg-1",
            threadId: "thread-1",
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
    ],
    isLoading: false,
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
  useShortcuts: (handlers: Record<string, unknown>) => {
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
    onOpenThread,
  }: {
    threads: Array<{ id: string }>;
    layout: string;
    onOpenThread: (index: number) => void;
  }) => (
    <div data-testid="thread-list" data-layout={layout}>
      {threads.map((thread, index) => (
        <button
          key={thread.id}
          type="button"
          onClick={() => onOpenThread(index)}
        >
          Open {thread.id}
        </button>
      ))}
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
    mockState.forceMenuOpen = false;
    mockState.shortcutHandlers = {};
  });

  afterEach(cleanup);

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
      fireEvent.click(screen.getByRole("button", { name: "Open thread-1" }));
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
});
