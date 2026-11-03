// @vitest-environment jsdom

import type { ReactElement } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InlineRuleSuggestionCard } from "./inline-rule-suggestion-card";

const { submitTextMessage } = vi.hoisted(() => ({
  submitTextMessage: vi.fn(),
}));
vi.mock("@/providers/ChatProvider", () => ({
  useChat: () => ({ submitTextMessage }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("contains approval send failures and permits retry without marking the rule created", async () => {
  submitTextMessage
    .mockRejectedValueOnce(new Error("Network request failed"))
    .mockResolvedValueOnce(undefined);
  const { result } = renderHook(() =>
    InlineRuleSuggestionCard({ name: "Archive newsletters", archive: "true" }),
  );
  const approve = () =>
    result.current.props.actions as ReactElement<{
      onClick: () => Promise<void>;
      disabled: boolean;
    }>;
  await act(async () => {
    await expect(approve().props.onClick()).resolves.toBeUndefined();
  });
  expect(approve().props.disabled).toBe(false);
  await act(async () => {
    await approve().props.onClick();
  });
  expect(submitTextMessage).toHaveBeenCalledTimes(2);
  expect(result.current.props.actions.props.children).toContain("Rule created");
});
