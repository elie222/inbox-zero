/** @vitest-environment jsdom */

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemType } from "@/generated/prisma/enums";

const mockUseRules = vi.fn();
const mockUseAccount = vi.fn();
const mockUseLabels = vi.fn();
const mockUseDialogState = vi.fn();
const mockSetOpen = vi.fn();
const mockSetInput = vi.fn();
const mockExecuteAsync = vi.fn();

(globalThis as { React?: typeof React }).React = React;

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("@/hooks/useRules", () => ({
  useRules: () => mockUseRules(),
}));

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => mockUseAccount(),
}));

vi.mock("@/hooks/useLabels", () => ({
  useLabels: () => mockUseLabels(),
}));

vi.mock("@/hooks/useDialogState", () => ({
  useDialogState: () => mockUseDialogState(),
}));

vi.mock("@/providers/ChatProvider", () => ({
  useChat: () => ({ setInput: mockSetInput }),
}));

vi.mock("@/env", () => ({
  env: new Proxy(
    {},
    {
      get: () => "",
    },
  ),
}));

vi.mock("@/utils/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({ setOpen: mockSetOpen }),
}));

vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ executeAsync: mockExecuteAsync }),
}));

vi.mock("./RuleDialog", () => ({
  RuleDialog: () => null,
}));

import { Rules } from "./Rules";

afterEach(() => {
  cleanup();
});

describe("Rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseRules.mockReturnValue({
      data: [
        {
          id: "system-rule-1",
          name: "Newsletter",
          instructions: "Auto-organize newsletters",
          enabled: true,
          runOnThreads: false,
          automate: true,
          actions: [],
          group: null,
          emailAccountId: "ea_1",
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          updatedAt: new Date("2026-03-01T00:00:00.000Z"),
          categoryFilterType: null,
          conditionalOperator: "OR",
          groupId: null,
          systemType: SystemType.NEWSLETTER,
          to: null,
          from: null,
          subject: null,
          body: null,
          promptText: null,
        },
        {
          id: "custom-rule-1",
          name: "Custom rule",
          instructions: "Handle a specific sender",
          enabled: true,
          runOnThreads: true,
          automate: true,
          actions: [],
          group: null,
          emailAccountId: "ea_1",
          createdAt: new Date("2026-03-02T00:00:00.000Z"),
          updatedAt: new Date("2026-03-02T00:00:00.000Z"),
          categoryFilterType: null,
          conditionalOperator: "OR",
          groupId: null,
          systemType: null,
          to: null,
          from: null,
          subject: null,
          body: null,
          promptText: null,
        },
      ],
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    });

    mockUseAccount.mockReturnValue({
      emailAccountId: "ea_1",
      provider: "google",
    });
    mockUseLabels.mockReturnValue({ userLabels: [] });
    mockUseDialogState.mockReturnValue({
      data: undefined,
      isOpen: false,
      onOpen: vi.fn(),
      onClose: vi.fn(),
    });
  });

  it("hides delete for default rules", () => {
    render(<Rules />);

    const newsletterRow = screen.getByText("Newsletter").closest("tr");
    expect(newsletterRow).toBeTruthy();

    fireEvent.pointerDown(
      within(newsletterRow as HTMLElement).getByRole("button", {
        name: "Toggle menu",
      }),
      { button: 0, ctrlKey: false },
    );

    expect(screen.queryByText("Delete")).toBeNull();
  });

  it("still shows delete for custom rules", () => {
    render(<Rules />);

    const customRuleRow = screen.getByText("Custom rule").closest("tr");
    expect(customRuleRow).toBeTruthy();

    fireEvent.pointerDown(
      within(customRuleRow as HTMLElement).getByRole("button", {
        name: "Toggle menu",
      }),
      { button: 0, ctrlKey: false },
    );

    expect(screen.getByText("Delete")).toBeTruthy();
  });
});
