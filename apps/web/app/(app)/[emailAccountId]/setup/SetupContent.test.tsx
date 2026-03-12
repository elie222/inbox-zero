/** @vitest-environment jsdom */

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetupContent } from "./SetupContent";

const mockUseAccount = vi.fn();
const mockUseSetupProgress = vi.fn();
const mockUseAction = vi.fn();
const mockSetLocalStorage = vi.fn();

(globalThis as { React?: typeof React }).React = React;

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => mockUseAccount(),
}));

vi.mock("@/hooks/useSetupProgress", () => ({
  useSetupProgress: () => mockUseSetupProgress(),
}));

vi.mock("next-safe-action/hooks", () => ({
  useAction: (...args: unknown[]) => mockUseAction(...args),
}));

vi.mock("usehooks-ts", () => ({
  useLocalStorage: () => [false, mockSetLocalStorage],
}));

vi.mock("@/components/InviteMemberModal", () => ({
  InviteMemberModal: () => null,
}));

vi.mock("@/components/LoadingContent", () => ({
  LoadingContent: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/utils/actions/hints", () => ({
  dismissHintAction: {},
}));

afterEach(() => {
  cleanup();
});

describe("SetupContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAccount.mockReturnValue({
      emailAccountId: "account-1",
      provider: "outlook",
    });

    mockUseSetupProgress.mockReturnValue({
      data: {
        steps: {
          aiAssistant: false,
          bulkUnsubscribe: false,
          calendarConnected: false,
        },
        completed: 0,
        total: 3,
        isComplete: false,
        teamInvite: null,
      },
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    });

    mockUseAction.mockReturnValue({
      executeAsync: vi.fn().mockResolvedValue({}),
      isExecuting: false,
    });
  });

  it("renders labeled done buttons and dismisses a setup step", async () => {
    const mutate = vi.fn();
    const executeAsync = vi.fn().mockResolvedValue({});

    mockUseSetupProgress.mockReturnValue({
      data: {
        steps: {
          aiAssistant: false,
          bulkUnsubscribe: false,
          calendarConnected: false,
        },
        completed: 0,
        total: 3,
        isComplete: false,
        teamInvite: null,
      },
      isLoading: false,
      error: null,
      mutate,
    });

    mockUseAction.mockReturnValue({
      executeAsync,
      isExecuting: false,
    });

    render(<SetupContent />);

    expect(screen.getAllByText("Done")).toHaveLength(3);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Mark done: Set up your Personal Assistant",
      }),
    );

    await waitFor(() => {
      expect(executeAsync).toHaveBeenCalledWith({
        hintId: "setup:aiAssistant:account-1",
      });
      expect(mutate).toHaveBeenCalled();
    });
  });
});
