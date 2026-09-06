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

  it("runs modified account shortcuts while the user is typing", () => {
    const switchAccount = vi.fn();
    const switchAllAccounts = vi.fn();
    renderShortcuts(
      { switchAccount, switchAllAccounts },
      MAIL_SCOPES,
      false,
      true,
    );
    const textbox = screen.getByRole("textbox");

    const accountEvent = press(
      { key: "2", code: "Digit2", ctrlKey: true },
      textbox,
    );
    const allAccountsEvent = press(
      { key: "0", code: "Digit0", ctrlKey: true },
      textbox,
    );

    expect(switchAccount).toHaveBeenCalledWith(accountEvent);
    expect(switchAllAccounts).toHaveBeenCalledWith(allAccountsEvent);
    expect(accountEvent.defaultPrevented).toBe(true);
    expect(allAccountsEvent.defaultPrevented).toBe(true);
  });

  it("leaves desktop account shortcuts inert in the web app", () => {
    const switchAccount = vi.fn();
    renderShortcuts({ switchAccount });

    const event = press({ key: "1", code: "Digit1", ctrlKey: true });

    expect(switchAccount).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("runs compose modifier shortcuts while the user is typing", () => {
    const sendAndMarkDone = vi.fn();
    const sendLater = vi.fn();
    const remindMe = vi.fn();
    const attachFiles = vi.fn();
    const discardDraft = vi.fn();
    renderShortcuts({
      sendAndMarkDone,
      sendLater,
      remindMe,
      attachFiles,
      discardDraft,
    });
    const textbox = screen.getByRole("textbox");

    press(
      { key: "Enter", code: "Enter", ctrlKey: true, shiftKey: true },
      textbox,
    );
    press({ key: "l", code: "KeyL", ctrlKey: true, shiftKey: true }, textbox);
    press({ key: "h", code: "KeyH", ctrlKey: true, shiftKey: true }, textbox);
    press({ key: "u", code: "KeyU", ctrlKey: true, shiftKey: true }, textbox);
    press({ key: "<", code: "Comma", ctrlKey: true, shiftKey: true }, textbox);

    expect(sendAndMarkDone).toHaveBeenCalledOnce();
    expect(sendLater).toHaveBeenCalledOnce();
    expect(remindMe).toHaveBeenCalledOnce();
    expect(attachFiles).toHaveBeenCalledOnce();
    expect(discardDraft).toHaveBeenCalledOnce();
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

  it("leaves dialog navigation keys to the browser", () => {
    const backToList = vi.fn();
    const open = vi.fn();
    const nextSplit = vi.fn();
    renderShortcuts({ backToList, nextSplit, open });

    const mailEvent = press({ key: "Tab", code: "Tab" });
    const mailOpenEvent = press({ key: "Enter", code: "Enter" });
    const dialogTabEvent = press(
      { key: "Tab", code: "Tab" },
      screen.getByRole("button", { name: "Dialog action" }),
    );
    const dialogOpenEvent = press(
      { key: "Enter", code: "Enter" },
      screen.getByRole("button", { name: "Dialog action" }),
    );
    const dialogEscapeEvent = press(
      { key: "Escape", code: "Escape" },
      screen.getByRole("button", { name: "Dialog action" }),
    );

    expect(nextSplit).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledOnce();
    expect(backToList).not.toHaveBeenCalled();
    expect(mailEvent.defaultPrevented).toBe(true);
    expect(mailOpenEvent.defaultPrevented).toBe(true);
    expect(dialogTabEvent.defaultPrevented).toBe(false);
    expect(dialogOpenEvent.defaultPrevented).toBe(false);
    expect(dialogEscapeEvent.defaultPrevented).toBe(false);
  });

  it("ignores modified presses of a plain shortcut", () => {
    const archive = vi.fn();
    renderShortcuts({ archive });

    press({ key: "e", code: "KeyE", metaKey: true });

    expect(archive).not.toHaveBeenCalled();
  });

  it("uses the reader action shortcuts", () => {
    const backToList = vi.fn();
    const markUnread = vi.fn();
    const markSpam = vi.fn();
    const move = vi.fn();
    const openExternal = vi.fn();
    const toggleLayout = vi.fn();
    renderShortcuts({
      backToList,
      markSpam,
      markUnread,
      move,
      openExternal,
      toggleLayout,
    });

    press({ key: "Escape", code: "Escape" }, screen.getByRole("textbox"));

    expect(backToList).toHaveBeenCalledOnce();

    press({ key: "u", code: "KeyU" });

    expect(backToList).toHaveBeenCalledOnce();
    expect(markUnread).toHaveBeenCalledOnce();

    press({ key: "v", code: "KeyV" });

    expect(move).toHaveBeenCalledOnce();

    press({ key: "V", code: "KeyV", shiftKey: true });

    expect(move).toHaveBeenCalledOnce();
    expect(toggleLayout).toHaveBeenCalledOnce();

    press({ key: "!", code: "Digit1", shiftKey: true });

    expect(markSpam).toHaveBeenCalledOnce();

    press({ key: "g", code: "KeyG" });
    press({ key: "g", code: "KeyG" });

    expect(openExternal).toHaveBeenCalledOnce();
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
  isDesktopApp = false,
) {
  return render(
    <ShortcutsProvider scopes={scopes}>
      <Bindings handlers={handlers} isDesktopApp={isDesktopApp} />
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

function Bindings({
  handlers,
  isDesktopApp,
}: {
  handlers: ShortcutHandlers;
  isDesktopApp: boolean;
}) {
  useShortcuts(handlers, { isDesktopApp });
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
