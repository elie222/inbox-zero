// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SIGNATURE_FIXTURES } from "../../fixtures/email-html";
import {
  EmailEditor,
  type EmailEditorHandle,
  type EmailEditorProps,
} from "../EmailEditor";

afterEach(cleanup);

// jsdom has no layout; the editor only needs a rect to position popovers.
Range.prototype.getBoundingClientRect = () => new DOMRect();

const QUOTE = {
  id: "quote",
  kind: "quote" as const,
  html: "<div>On Monday, Sender wrote:</div><blockquote>Earlier message</blockquote>",
};
const SIGNATURE = {
  id: "signature",
  kind: "signature" as const,
  html: SIGNATURE_FIXTURES.tableWithLogo,
};

describe("Squire email editor", () => {
  it("sends an untouched draft exactly as loaded", async () => {
    const initialHtml = "<div>Draft body<!--[if mso]>x<![endif]--></div>";
    const { handle, textbox } = await renderEditor({
      initialHtml,
      mode: "fallback",
      preservedBlocks: [SIGNATURE, QUOTE],
    });

    expect(textbox().textContent).toContain("Draft body");
    expect(handle().getValue()).toEqual({
      editableHtml: initialHtml,
      inlineContentIds: [],
      mode: "fallback",
      preservedBlockIds: ["signature", "quote"],
    });
  });

  it("keeps the collapsed signature out of the editable area", async () => {
    const { textbox } = await renderEditor({
      preservedBlocks: [SIGNATURE, QUOTE],
    });

    expect(textbox().textContent).not.toContain("Example Person");
    expect(
      screen.getByRole("button", { name: "Show signature and quoted message" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Remove signature" }),
    ).toBeNull();
  });

  it("shows the full signature for editing when expanded", async () => {
    const { textbox } = await renderEditor({ preservedBlocks: [SIGNATURE] });

    fireEvent.click(screen.getByRole("button", { name: "Show signature" }));

    const signature = textbox().querySelector("[data-smartmail]");
    expect(signature?.querySelector("table")).toBeTruthy();
    expect(signature?.textContent).toContain("Head of Examples");
    expect(
      screen.getByRole("button", { name: "Remove signature" }),
    ).toBeTruthy();
  });

  it("includes the collapsed signature in the edited body", async () => {
    const { handle } = await renderEditor({
      preservedBlocks: [SIGNATURE, QUOTE],
    });

    act(() => {
      handle().insertText("Hello");
    });
    const value = handle().getValue();

    expect(value.mode).toBe("html");
    expect(value.preservedBlockIds).toEqual(["quote"]);
    expect(value.editableHtml).toContain("Hello");
    expect(value.editableHtml).toContain(
      '<div data-smartmail="gmail_signature">',
    );
    expect(value.editableHtml).toContain("<table");
    expect(value.editableHtml).toContain('cellpadding="0"');
  });

  it("removes the signature from the sent body", async () => {
    const { handle, textbox } = await renderEditor({
      preservedBlocks: [SIGNATURE],
    });

    fireEvent.click(screen.getByRole("button", { name: "Show signature" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove signature" }));

    expect(textbox().querySelector("[data-smartmail]")).toBeNull();
    expect(screen.queryByRole("button", { name: /signature/u })).toBeNull();
    const value = handle().getValue();
    expect(value.mode).toBe("html");
    expect(value.editableHtml).not.toContain("Example Person");
    expect(value.preservedBlockIds).toEqual([]);
  });

  it("keeps the signature when undo goes back past expanding it", async () => {
    const { handle, textbox, onStateChange } = await renderEditor({
      preservedBlocks: [SIGNATURE],
    });
    fireEvent.click(screen.getByRole("button", { name: "Show signature" }));
    act(() => {
      handle().insertText("Hello");
    });

    act(() => {
      fireEvent.keyDown(textbox(), { key: "z", ctrlKey: true });
      fireEvent.keyDown(textbox(), { key: "z", ctrlKey: true });
    });

    expect(textbox().querySelector("[data-smartmail]")).toBeTruthy();
    expect(handle().getValue().editableHtml).toContain("Example Person");
    expect(onStateChange).toHaveBeenCalled();
  });

  it("undoes and redoes removing the signature", async () => {
    const { handle, textbox } = await renderEditor({
      preservedBlocks: [SIGNATURE],
    });
    fireEvent.click(screen.getByRole("button", { name: "Show signature" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove signature" }));
    expect(textbox().querySelector("[data-smartmail]")).toBeNull();

    await act(async () => {
      fireEvent.keyDown(textbox(), { key: "z", ctrlKey: true });
    });
    expect(textbox().querySelector("[data-smartmail]")).toBeTruthy();
    // Back to the untouched draft: the original signature is re-attached.
    expect(handle().getValue().preservedBlockIds).toContain("signature");

    await act(async () => {
      fireEvent.keyDown(textbox(), { key: "y", ctrlKey: true });
    });
    expect(textbox().querySelector("[data-smartmail]")).toBeNull();
    const value = handle().getValue();
    expect(value.editableHtml).not.toContain("Example Person");
    expect(value.preservedBlockIds).not.toContain("signature");
  });

  it("returns to the untouched draft when every edit is undone", async () => {
    const initialHtml = "<div>Original</div>";
    const { handle, textbox } = await renderEditor({
      initialHtml,
      mode: "fallback",
    });
    await act(async () => {
      handle().insertText(" more");
    });
    expect(handle().getValue().mode).toBe("html");

    await act(async () => {
      fireEvent.keyDown(textbox(), { key: "z", ctrlKey: true });
    });

    expect(handle().getValue()).toMatchObject({
      editableHtml: initialHtml,
      mode: "fallback",
    });
  });

  it("stays untouched after an undo with nothing to undo", async () => {
    const initialHtml = "<div>Original</div>";
    const { handle, textbox } = await renderEditor({
      initialHtml,
      mode: "fallback",
    });

    act(() => {
      fireEvent.keyDown(textbox(), { key: "z", ctrlKey: true });
    });

    expect(handle().getValue()).toMatchObject({
      editableHtml: initialHtml,
      mode: "fallback",
    });
  });

  it("collapses a signature restored from an earlier session", async () => {
    const { handle, textbox } = await renderEditor({
      initialHtml:
        '<div>Reply</div><div data-smartmail="gmail_signature"><div>Example Person</div></div>',
      mode: "html",
    });

    expect(textbox().textContent).toBe("Reply");
    expect(screen.getByRole("button", { name: "Show signature" })).toBeTruthy();
    act(() => {
      handle().insertText("!");
    });
    expect(handle().getValue().editableHtml).toContain(
      '<div data-smartmail="gmail_signature"><div>Example Person</div></div>',
    );
  });

  it("sanitizes loaded and inserted HTML", async () => {
    const { handle, textbox } = await renderEditor({
      initialHtml:
        '<div onclick="alert(1)">Hi<img src="x" onerror="alert(1)"><script>alert(1)</script></div>',
      mode: "fallback",
    });
    act(() => {
      handle().insertHtml(
        '<a href="javascript:alert(1)">bad</a><iframe></iframe>',
      );
    });

    const html = textbox().innerHTML;
    expect(html).not.toMatch(/onclick|onerror|<script|<iframe|javascript:/u);
    expect(handle().getValue().editableHtml).not.toMatch(
      /onclick|onerror|<script|<iframe|javascript:/u,
    );
  });

  it("shows remote images through the resolver and sends the original URL", async () => {
    const resolveRemoteImages = vi.fn(async (sources: string[]) =>
      Object.fromEntries(
        sources.map((source) => [
          source,
          `/api/image-proxy?u=${encodeURIComponent(source)}`,
        ]),
      ),
    );
    const { handle, textbox } = await renderEditor({
      initialHtml:
        '<div>Hi <img src="https://assets.example.com/a.png" alt="A"></div>',
      mode: "fallback",
      resolveRemoteImages,
    });

    await act(async () => {});

    expect(resolveRemoteImages).toHaveBeenCalledWith([
      "https://assets.example.com/a.png",
    ]);
    expect(textbox().querySelector("img")?.getAttribute("src")).toBe(
      "/api/image-proxy?u=https%3A%2F%2Fassets.example.com%2Fa.png",
    );
    act(() => {
      handle().insertText("!");
    });
    const { editableHtml } = handle().getValue();
    expect(editableHtml).toContain('src="https://assets.example.com/a.png"');
    expect(editableHtml).not.toContain("image-proxy");
    expect(editableHtml).not.toContain("data-original-src");
  });

  it("leaves remote images unloaded without a resolver", async () => {
    const { textbox } = await renderEditor({
      initialHtml:
        '<div><img src="https://assets.example.com/a.png" alt="A"></div>',
      mode: "fallback",
    });

    expect(textbox().querySelector("img")?.hasAttribute("src")).toBe(false);
  });

  it("inserts, reports and removes inline images", async () => {
    const { handle, onStateChange } = await renderEditor({});

    // Squire reports edits from a MutationObserver.
    await act(async () => {
      handle().insertInlineImage({
        alt: "Chart",
        contentId: "chart@example",
        previewUrl: "blob:https://app.example/chart",
      });
    });
    expect(handle().getValue().inlineContentIds).toEqual(["chart@example"]);
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ inlineContentIds: ["chart@example"] }),
    );

    act(() => {
      expect(handle().removeInlineImage("chart@example")).toBe(true);
    });
    expect(handle().getValue().inlineContentIds).toEqual([]);
  });

  it("reports a slash trigger and replaces it with a snippet", async () => {
    const onSlashTrigger = vi.fn();
    const { handle } = await renderEditor({ onSlashTrigger });

    await act(async () => {
      handle().insertText("Hi /sig");
    });

    expect(onSlashTrigger).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: "sig" }),
    );
    act(() => {
      expect(handle().replaceSlashTrigger("<b>Snippet</b>")).toBe(true);
    });
    const { editableHtml } = handle().getValue();
    expect(editableHtml).toMatch(/Hi(?:&nbsp;| )<b>Snippet<\/b>/u);
    expect(editableHtml).not.toContain("/sig");
    expect(onSlashTrigger).toHaveBeenLastCalledWith(null);
  });

  it("ignores slashes inside words", async () => {
    const onSlashTrigger = vi.fn();
    const { handle } = await renderEditor({ onSlashTrigger });

    await act(async () => {
      handle().insertText("and/or");
    });

    expect(onSlashTrigger).not.toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.any(String) }),
    );
  });

  it("forwards picker keys and dismisses the trigger on Escape", async () => {
    const onSlashTrigger = vi.fn();
    const onSlashKeyDown = vi.fn(
      (event: KeyboardEvent) => event.key === "Enter",
    );
    const { handle, textbox } = await renderEditor({
      onSlashKeyDown,
      onSlashTrigger,
    });
    await act(async () => {
      handle().insertText("/");
    });

    const enter = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
    });
    textbox().dispatchEvent(enter);
    expect(onSlashKeyDown).toHaveBeenCalled();
    expect(enter.defaultPrevented).toBe(true);

    act(() => {
      fireEvent.keyDown(textbox(), { key: "Escape" });
    });
    expect(onSlashTrigger).toHaveBeenLastCalledWith(null);
  });

  it("adds a link from the keyboard shortcut", async () => {
    const { handle, textbox } = await renderEditor({});
    act(() => {
      handle().insertText("Read ");
    });

    act(() => {
      fireEvent.keyDown(textbox(), { key: "k", ctrlKey: true });
    });
    const dialog = screen.getByRole("dialog", { name: "Add link" });
    fireEvent.change(dialog.querySelector("input") as HTMLInputElement, {
      target: { value: "example.com/docs" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    const link = textbox().querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://example.com/docs");
    expect(link?.textContent).toBe("https://example.com/docs");
  });

  it("asks for an address before adding a link", async () => {
    const { textbox } = await renderEditor({});

    act(() => {
      fireEvent.keyDown(textbox(), { key: "k", ctrlKey: true });
    });
    fireEvent.change(screen.getByLabelText("Link address"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByRole("alert").textContent).toContain("safe");
    expect(textbox().querySelector("a")).toBeNull();
  });

  it("hands pasted image files to the app instead of inserting them", async () => {
    const onImageFiles = vi.fn();
    const { textbox } = await renderEditor({ onImageFiles });
    const file = new File(["x"], "photo.png", { type: "image/png" });

    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", {
      value: { files: [file], getData: () => "", items: [], types: ["Files"] },
    });
    textbox().dispatchEvent(paste);

    expect(onImageFiles).toHaveBeenCalledWith([file]);
    expect(paste.defaultPrevented).toBe(true);
  });
});

async function renderEditor(props: Partial<EmailEditorProps>) {
  const ref = createRef<EmailEditorHandle>();
  const onStateChange = vi.fn();
  render(
    <EmailEditor
      engine="squire"
      initialHtml=""
      onStateChange={onStateChange}
      ref={ref}
      {...props}
    />,
  );
  // The Squire engine is loaded lazily.
  await screen.findByRole("textbox", { name: "Email message" });
  return {
    handle: () => {
      if (!ref.current) throw new Error("Editor handle is not ready");
      return ref.current;
    },
    onStateChange,
    textbox: () => screen.getByRole("textbox", { name: "Email message" }),
  };
}
