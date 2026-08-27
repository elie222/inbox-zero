// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShortcutHandlers, ShortcutScope } from "./registry";
import { ShortcutsProvider } from "./ShortcutsProvider";
import { useShortcuts } from "./useShortcuts";

const MAIL_SCOPES: ShortcutScope[] = ["global", "mail"];
const GLOBAL_SCOPES: ShortcutScope[] = ["global"];

afterEach(cleanup);

describe("useShortcuts", () => {
  it("runs the handler for a mail shortcut while the mail scope is active", () => {
    const archive = vi.fn();
    const snooze = vi.fn();
    renderShortcuts({ archive, snooze });

    press({ key: "e", code: "KeyE" });
    press({ key: "h", code: "KeyH" });

    expect(archive).toHaveBeenCalledOnce();
    expect(snooze).toHaveBeenCalledOnce();
  });

  it("leaves mail shortcuts inert outside the mail scope", () => {
    const archive = vi.fn();
    const commandPalette = vi.fn();
    renderShortcuts({ archive, commandPalette }, GLOBAL_SCOPES);

    press({ key: "e", code: "KeyE" });
    press({ key: "k", code: "KeyK", ctrlKey: true });

    expect(archive).not.toHaveBeenCalled();
    expect(commandPalette).toHaveBeenCalledOnce();
  });

  it("stays quiet while the user is typing", () => {
    const archive = vi.fn();
    const send = vi.fn();
    renderShortcuts({ archive, send });

    press({ key: "e", code: "KeyE" }, screen.getByRole("textbox"));

    expect(archive).not.toHaveBeenCalled();

    // ⌘/ctrl combos are the exception: sending happens from the composer
    press(
      { key: "Enter", code: "Enter", ctrlKey: true },
      screen.getByRole("textbox"),
    );

    expect(send).toHaveBeenCalledOnce();
  });

  it("leaves Mod-K to an email editor's link control", () => {
    const commandPalette = vi.fn();
    renderShortcuts({ commandPalette }, MAIL_SCOPES, true);

    press(
      { key: "k", code: "KeyK", ctrlKey: true },
      screen.getByRole("textbox", { name: "Email message" }),
    );

    expect(commandPalette).not.toHaveBeenCalled();
  });

  it("leaves Tab navigation inside dialogs to the browser", () => {
    const nextSplit = vi.fn();
    renderShortcuts({ nextSplit });

    const mailEvent = press({ key: "Tab", code: "Tab" });
    const dialogEvent = press(
      { key: "Tab", code: "Tab" },
      screen.getByRole("button", { name: "Dialog action" }),
    );

    expect(nextSplit).toHaveBeenCalledOnce();
    expect(mailEvent.defaultPrevented).toBe(true);
    expect(dialogEvent.defaultPrevented).toBe(false);
  });

  it("ignores modified presses of a plain shortcut", () => {
    const archive = vi.fn();
    renderShortcuts({ archive });

    press({ key: "e", code: "KeyE", metaKey: true });

    expect(archive).not.toHaveBeenCalled();
  });

  it("uses Escape rather than U for back navigation", () => {
    const backToList = vi.fn();
    renderShortcuts({ backToList });

    press({ key: "Escape", code: "Escape" }, screen.getByRole("textbox"));

    expect(backToList).toHaveBeenCalledOnce();

    press({ key: "u", code: "KeyU" });

    expect(backToList).toHaveBeenCalledOnce();
  });

  it("treats G then A as back to the app rather than reply all", () => {
    const backToApp = vi.fn();
    const replyAll = vi.fn();
    renderShortcuts({ backToApp, replyAll });

    press({ key: "g", code: "KeyG" });
    press({ key: "a", code: "KeyA" });

    expect(backToApp).toHaveBeenCalledOnce();
    expect(replyAll).not.toHaveBeenCalled();
  });

  it("lets an abandoned sequence prefix through to the next shortcut", () => {
    const backToApp = vi.fn();
    const next = vi.fn();
    renderShortcuts({ backToApp, next });

    // `g` starts a sequence that `j` doesn't complete, so `j` must still move
    // rather than being eaten by the dangling prefix.
    press({ key: "g", code: "KeyG" });
    press({ key: "j", code: "KeyJ" });

    expect(next).toHaveBeenCalledOnce();
    expect(backToApp).not.toHaveBeenCalled();
  });

  it("treats A on its own as reply all", () => {
    const backToApp = vi.fn();
    const replyAll = vi.fn();
    renderShortcuts({ backToApp, replyAll });

    press({ key: "a", code: "KeyA" });

    expect(replyAll).toHaveBeenCalledOnce();
    expect(backToApp).not.toHaveBeenCalled();
  });

  it("does not bind keys that have no handler", () => {
    const archive = vi.fn();
    renderShortcuts({ archive });

    const event = press({ key: "z", code: "KeyZ" });

    expect(event.defaultPrevented).toBe(false);
  });
});

function renderShortcuts(
  handlers: ShortcutHandlers,
  scopes: ShortcutScope[] = MAIL_SCOPES,
  withEmailEditor = false,
) {
  return render(
    <ShortcutsProvider scopes={scopes}>
      <Bindings handlers={handlers} />
      <textarea />
      <div aria-label="Test dialog" role="dialog">
        <button type="button">Dialog action</button>
      </div>
      {withEmailEditor && (
        <div
          aria-label="Email message"
          contentEditable
          data-email-editor-root
          role="textbox"
          suppressContentEditableWarning
          tabIndex={0}
        />
      )}
    </ShortcutsProvider>,
  );
}

function Bindings({ handlers }: { handlers: ShortcutHandlers }) {
  useShortcuts(handlers);
  return null;
}

function press(init: KeyboardEventInit, target: Element = document.body) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  fireEvent(target, event);
  return event;
}
