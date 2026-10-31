// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { isSafeToReload } from "@/utils/safe-reload";
import { ComposeEmailFormLazy } from "./ComposeEmailFormLazy";

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("posthog-js", () => ({ default: { capture } }));
const { account } = vi.hoisted(() => ({
  account: { emailAccountId: "account-1" },
}));
vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => account,
}));
vi.mock("next/dynamic", () => ({
  default:
    () =>
    ({ onClose }: { onClose?: () => void }) => (
      <div>
        <textarea aria-label="Email message" />
        <button onClick={() => onClose?.()} type="button">
          Close
        </button>
      </div>
    ),
}));

afterEach(() => {
  cleanup();
  capture.mockClear();
});

it("blocks reload as soon as a composer opens, including while its code loads", () => {
  const view = render(<ComposeEmailFormLazy />);
  expect(isSafeToReload()).toBe(false);
  view.unmount();
  expect(isSafeToReload()).toBe(true);
});

// Typing goes to the page's shortcuts once the editor is gone, so a composer
// taken away mid-sentence is reported with how long it was missing.
it("reports a focused composer that unmounts without being closed", async () => {
  const props = {
    draftSessionId: "message-1:reply",
    draftMode: "reply" as const,
  };
  const first = render(<ComposeEmailFormLazy {...props} />);
  await focusEditor();
  first.unmount();
  render(<ComposeEmailFormLazy {...props} />);

  expect(capture).toHaveBeenCalledWith(
    "mail_composer_lost",
    expect.objectContaining({
      draft_mode: "reply",
      trigger: "remount",
    }),
  );
});

it("does not match a new message in another account", async () => {
  const view = render(<ComposeEmailFormLazy />);
  await focusEditor();
  view.unmount();
  account.emailAccountId = "account-2";
  try {
    render(<ComposeEmailFormLazy />);
  } finally {
    account.emailAccountId = "account-1";
  }

  expect(capture).not.toHaveBeenCalled();
});

// Escape and leaving mail also take a focused composer away on purpose.
it("does not report a focused composer that stays gone", async () => {
  vi.useFakeTimers();
  try {
    const view = render(
      <ComposeEmailFormLazy draftSessionId="message-4:reply" />,
    );
    await focusEditor();
    view.unmount();
    act(() => vi.advanceTimersByTime(10_000));
    render(<ComposeEmailFormLazy draftSessionId="message-4:reply" />);
  } finally {
    vi.useRealTimers();
  }

  expect(capture).not.toHaveBeenCalled();
});

it("does not report a composer the user closed", async () => {
  const view = render(
    <ComposeEmailFormLazy draftSessionId="message-2:reply" onClose={vi.fn()} />,
  );
  await focusEditor();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  view.unmount();
  render(<ComposeEmailFormLazy draftSessionId="message-2:reply" />);

  expect(capture).not.toHaveBeenCalled();
});

it("reports a key that lands on the page after the editor was removed", async () => {
  render(<ComposeEmailFormLazy draftSessionId="message-3:reply" />);
  await focusEditor();
  act(() => screen.getByRole("textbox", { name: "Email message" }).remove());
  await act(async () => {});
  fireEvent.keyDown(document.body, { key: "h" });

  expect(capture).toHaveBeenCalledWith(
    "mail_composer_lost",
    expect.objectContaining({ trigger: "keypress" }),
  );
});

async function focusEditor() {
  await act(async () => {
    screen.getByRole("textbox", { name: "Email message" }).focus();
  });
}
