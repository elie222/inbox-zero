// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useRule } from "@/hooks/useRule";
import { RuleLoader } from "./RuleLoader";

vi.mock("@/hooks/useRule");
vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_SUPPORT_EMAIL: "support@example.com" },
}));
vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({ emailAccountId: "account-1" }),
}));

afterEach(cleanup);

it("preserves unsaved rule edits through a failed refresh and recovery", () => {
  const response = {
    data: { rule: { name: "Original rule" } },
    isLoading: false,
    mutate: vi.fn(),
  } as ReturnType<typeof useRule>;
  vi.mocked(useRule).mockReturnValue(response);
  const form = () => (
    <RuleLoader ruleId="rule-1">
      {({ rule }) => <input aria-label="Rule name" defaultValue={rule.name} />}
    </RuleLoader>
  );
  const { rerender } = render(<div>{form()}</div>);
  const input = screen.getByRole("textbox") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "Unsaved edit" } });
  input.focus();

  vi.mocked(useRule).mockReturnValue({
    ...response,
    error: { error: "Temporary refresh failure" },
  });
  rerender(<div>{form()}</div>);
  expect(screen.getByRole("textbox")).toBe(input);
  expect(input.value).toBe("Unsaved edit");
  expect(document.activeElement).toBe(input);

  vi.mocked(useRule).mockReturnValue(response);
  rerender(<div>{form()}</div>);
  expect(screen.getByRole("textbox")).toBe(input);
  expect(input.value).toBe("Unsaved edit");
});

it("shows a confirmed deletion even when the rule is cached", () => {
  vi.mocked(useRule).mockReturnValue({
    data: { rule: { name: "Deleted rule" } },
    error: { error: "Rule not found" },
    isLoading: false,
    mutate: vi.fn(),
  } as ReturnType<typeof useRule>);
  render(
    <RuleLoader ruleId="rule-1">
      {({ rule }) => <input aria-label="Rule name" defaultValue={rule.name} />}
    </RuleLoader>,
  );
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getByText("Rule not found")).toBeTruthy();
});
