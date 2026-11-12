/** @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingBulkInboxActionToolOutput } from "@/utils/actions/assistant-chat.validation";

const actions = vi.hoisted(() => ({
  confirmAssistantBulkInboxAction: vi.fn(),
  dismissAssistantBulkInboxAction: vi.fn(),
  cancelBulkInboxActionJob: vi.fn(),
}));

vi.mock("@/utils/actions/assistant-chat", () => actions);
vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({ emailAccountId: "ea_1" }),
}));
vi.mock("@/providers/ChatProvider", () => ({
  useChat: () => ({ chatId: "chat-1" }),
}));
vi.mock("@/hooks/useBulkInboxActionJob", () => ({
  useBulkInboxActionJob: () => ({ data: undefined, mutate: vi.fn() }),
}));

import { BulkInboxActionCard } from "@/components/assistant-chat/bulk-inbox-action-card";

describe("BulkInboxActionCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows why starting failed and lets the user try again or cancel", async () => {
    actions.confirmAssistantBulkInboxAction.mockResolvedValue({
      serverError:
        "Couldn't queue the cleanup. Nothing changed, so you can try again.",
    });
    renderCard(pendingOutput());

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Couldn't queue the cleanup",
      ),
    );
    expect(isEnabled(screen.getByRole("button", { name: "Archive" }))).toBe(
      true,
    );
    expect(isEnabled(screen.getByRole("button", { name: "Cancel" }))).toBe(
      true,
    );
  });

  it("offers a retry when an earlier start never finished", () => {
    renderCard({
      ...pendingOutput(),
      confirmationState: "processing",
      confirmationProcessingAt: new Date(
        Date.now() - 10 * 60 * 1000,
      ).toISOString(),
    });

    expect(screen.getByRole("alert").textContent).toContain(
      "didn't finish starting",
    );
    expect(isEnabled(screen.getByRole("button", { name: "Archive" }))).toBe(
      true,
    );
    expect(isEnabled(screen.getByRole("button", { name: "Cancel" }))).toBe(
      true,
    );
  });

  it("keeps the buttons disabled while a start is still in progress", () => {
    renderCard({
      ...pendingOutput(),
      confirmationState: "processing",
      confirmationProcessingAt: new Date().toISOString(),
    });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(isEnabled(screen.getByRole("button", { name: "Archive" }))).toBe(
      false,
    );
  });
});

function renderCard(output: PendingBulkInboxActionToolOutput) {
  render(
    <BulkInboxActionCard
      output={output}
      chatMessageId="chat-message-1"
      toolCallId="tool-1"
      disableConfirm={false}
    />,
  );
}

function isEnabled(element: HTMLElement) {
  return !(element as HTMLButtonElement).disabled;
}

function pendingOutput(): PendingBulkInboxActionToolOutput {
  return {
    success: true,
    actionType: "bulk_inbox_action",
    requiresConfirmation: true,
    confirmationState: "pending",
    pendingAction: {
      search: { query: "in:inbox" },
      action: "archive_threads",
      labelId: null,
      labelName: null,
      instruction: null,
    },
    estimate: { threadCount: 40, isApproximate: false, searchThreadCount: 40 },
    matchSummary: "newsletters",
    samples: [{ from: "Tech Weekly <a@b.example>", subject: "Hi", date: "" }],
  };
}
