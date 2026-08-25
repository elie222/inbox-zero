// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "./types";
import { EmailList } from "./EmailList";

const outbox = vi.hoisted(() => ({ enqueue: vi.fn(), retain: vi.fn() }));
const query = vi.hoisted(() => ({ setThreadId: vi.fn() }));

vi.mock("nuqs", () => ({
  useQueryState: () => [null, query.setThreadId],
}));
vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({
    emailAccountId: "account-1",
    provider: "google",
    userEmail: "user@example.com",
  }),
}));
vi.mock("@/hooks/useMailMutationOverlay", () => ({
  applyMailMutationOverlayToThreads: ({ threads }: { threads: Thread[] }) =>
    threads,
  useRetainedMailMutationOverlay: () => ({
    isReady: true,
    mutations: [],
    retainMutations: outbox.retain,
  }),
}));
vi.mock("@/utils/email-cache/thread-mail-mutations", () => ({
  enqueueThreadMailMutationBatch: outbox.enqueue,
}));
vi.mock("@/utils/queue/email-actions", () => ({ runAiRules: vi.fn() }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/Checkbox", () => ({
  Checkbox: () => null,
}));
vi.mock("@/components/ActionButtonsBulk", () => ({
  ActionButtonsBulk: () => null,
}));
vi.mock("@/components/email-list/EmailPanel", () => ({
  EmailPanel: () => null,
}));
vi.mock("@/components/email-list/EmailListItem", () => ({
  EmailListItem: ({
    onArchive,
    onClick,
    thread,
  }: {
    onArchive: (thread: Thread) => void;
    onClick: () => void;
    thread: Thread;
  }) => (
    <li>
      <button type="button" onClick={() => onArchive(thread)}>
        Archive {thread.id}
      </button>
      <button type="button" onClick={onClick}>
        Open {thread.id}
      </button>
    </li>
  ),
}));
vi.mock("@/components/ui/resizable", () => ({
  ResizableHandle: () => null,
  ResizablePanel: ({ children }: { children: React.ReactNode }) => children,
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    promise: vi.fn((run: () => Promise<unknown>) => run()),
  },
}));

describe("EmailList durable actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    outbox.enqueue.mockResolvedValue({
      batchId: "batch",
      mutations: [{ id: "mutation" }],
    });
  });

  it("persists exact archive and read snapshots and injects their overlays", async () => {
    const thread = {
      id: "thread-1",
      messages: [{ id: "message-1" }, { id: "message-2" }],
      plan: undefined,
      plans: [],
      snippet: "Preview",
    } as unknown as Thread;
    render(<EmailList threads={[thread]} />);

    fireEvent.click(screen.getByRole("button", { name: "Archive thread-1" }));
    await waitFor(() =>
      expect(outbox.enqueue).toHaveBeenCalledWith({
        emailAccountId: "account-1",
        payload: { kind: "archive" },
        threads: [thread],
      }),
    );
    expect(outbox.retain).toHaveBeenCalledWith([{ id: "mutation" }]);

    outbox.enqueue.mockResolvedValue({
      batchId: "read-batch",
      mutations: [{ id: "read-mutation" }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Open thread-1" }));
    await waitFor(() =>
      expect(outbox.enqueue).toHaveBeenLastCalledWith({
        emailAccountId: "account-1",
        payload: { kind: "set_read_state", read: true },
        threads: [thread],
      }),
    );
    expect(outbox.retain).toHaveBeenLastCalledWith([{ id: "read-mutation" }]);
  });
});
