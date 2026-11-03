// @vitest-environment jsdom

import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InlineRuleSuggestionCard } from "./inline-rule-suggestion-card";

(globalThis as { React?: typeof React }).React = React;

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
  render(
    <InlineRuleSuggestionCard name="Archive newsletters" archive="true" />,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  });
  expect(
    screen.getByRole("button", { name: "Approve" }).hasAttribute("disabled"),
  ).toBe(false);
  expect(screen.queryByText("Rule created")).toBeNull();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  });
  expect(submitTextMessage).toHaveBeenCalledTimes(2);
  expect(screen.getByText("Rule created")).toBeTruthy();
});
