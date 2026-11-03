// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
      mode: "original",
      preservedBlocks: [SIGNATURE, QUOTE],
    });

    expect(textbox().textContent).toContain("Draft body");
    expect(handle().getValue()).toEqual({
      editableHtml: initialHtml,
      inlineContentIds: [],
      mode: "original",
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
  });

  it("shows the full signature for editing when expanded", async () => {
    const { textbox } = await renderEditor({ preservedBlocks: [SIGNATURE] });

    fireEvent.click(screen.getByRole("button", { name: "Show signature" }));

    const signature = textbox().querySelector("[data-smartmail]");
    expect(signature?.querySelector("table")).toBeTruthy();
    expect(signature?.textContent).toContain("Head of Examples");
  });

  it("includes the collapsed signature in the edited body", async () => {
    const { handle } = await renderEditor({
      preservedBlocks: [SIGNATURE, QUOTE],
    });

    act(() => {
      handle().insertText("Hello");
    });
    const value = handle().getValue();

    expect(value.mode).toBe("edited");
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
    await deleteSignature(textbox());

    expect(textbox().querySelector("[data-smartmail]")).toBeNull();
    expect(screen.queryByRole("button", { name: /signature/u })).toBeNull();
    const value = handle().getValue();
    expect(value.mode).toBe("edited");
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

  it("sends no trailing line break after the signature is deleted", async () => {
    const { handle, textbox } = await renderEditor({
      preservedBlocks: [SIGNATURE],
    });
    fireEvent.click(screen.getByRole("button", { name: "Show signature" }));
    act(() => {
      handle().insertText("Draft body");
    });

    await deleteSignature(textbox());

    expect(handle().getValue().editableHtml).toBe("<div>Draft body</div>");
  });

  it("sends a typed URL as a link even when nothing was typed after it", async () => {
    const { handle, textbox } = await renderEditor({
      initialHtml: "<div>Body</div>",
      mode: "original",
    });
    // Squire links a URL only once a space or Enter follows it, so a URL at
    // the end of the message reaches send as plain text.
    const typed = document.createElement("div");
    typed.textContent = "See example.com/settings";
    await act(async () => {
      textbox().append(typed);
    });

    const { editableHtml } = handle().getValue();
    expect(editableHtml).toContain(
      '<a href="http://example.com/settings" rel="noopener noreferrer" target="_blank">example.com/settings</a>',
    );
  });

  it("keeps a line break inside inline content followed by more text", async () => {
    const { handle } = await renderEditor({
      initialHtml:
        "<div><b>123 Main St<br></b><i>Springfield</i></div><div>Body</div>",
      mode: "original",
    });
    act(() => {
      handle().insertText("x");
    });

    expect(handle().getValue().editableHtml).toContain(
      "123 Main St<br></b><i>Springfield",
    );
  });

  it("undoes and redoes removing the signature", async () => {
    const { handle, textbox } = await renderEditor({
      preservedBlocks: [SIGNATURE],
    });
    fireEvent.click(screen.getByRole("button", { name: "Show signature" }));
    await deleteSignature(textbox());
    expect(textbox().querySelector("[data-smartmail]")).toBeNull();

    await act(async () => {
      fireEvent.keyDown(textbox(), { key: "z", ctrlKey: true });
    });
    expect(textbox().querySelector("[data-smartmail]")).toBeTruthy();
    expect(handle().getValue().editableHtml).toContain("Example Person");

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
      mode: "original",
    });
    await act(async () => {
      handle().insertText(" more");
    });
    expect(handle().getValue().mode).toBe("edited");

    await act(async () => {
      fireEvent.keyDown(textbox(), { key: "z", ctrlKey: true });
    });

    expect(handle().getValue()).toMatchObject({
      editableHtml: initialHtml,
      mode: "original",
    });
  });

  it("stays untouched after an undo with nothing to undo", async () => {
    const initialHtml = "<div>Original</div>";
    const { handle, textbox } = await renderEditor({
      initialHtml,
      mode: "original",
    });

    act(() => {
      fireEvent.keyDown(textbox(), { key: "z", ctrlKey: true });
    });

    expect(handle().getValue()).toMatchObject({
      editableHtml: initialHtml,
      mode: "original",
    });
  });

  it("adds no blank lines across expanding and collapsing the signature", async () => {
    const { handle } = await renderEditor({
      initialHtml: "<div>Body</div>",
      mode: "original",
      preservedBlocks: [
        { id: "signature", kind: "signature", html: "<div>Sig</div>" },
      ],
    });

    for (let cycle = 0; cycle < 3; cycle++) {
      fireEvent.click(await screen.findByRole("button", { name: /^Show/u }));
      await act(async () => {
        handle().insertText("x");
      });
      fireEvent.click(await screen.findByRole("button", { name: /^Hide/u }));
      await act(async () => {});
    }

    expect(handle().getValue().editableHtml).toBe(
      '<div>Bodyxxx</div><div data-smartmail="gmail_signature"><div><br></div><div>Sig</div></div>',
    );
  });

  it("replaces a collapsed signature and keeps the message", async () => {
    const { handle, textbox } = await renderEditor({
      initialHtml: "<div>Body</div>",
      mode: "original",
      preservedBlocks: [
        { id: "signature", kind: "signature", html: "<div>Old</div>" },
      ],
    });

    await act(async () => {
      handle().replaceSignature("<div>New</div>");
    });

    expect(textbox().textContent).toBe("Body");
    const value = handle().getValue();
    expect(value.preservedBlockIds).not.toContain("signature");
    expect(value.editableHtml).toBe(
      '<div>Body</div><div data-smartmail="gmail_signature"><div><br></div><div>New</div></div>',
    );
  });

  it("replaces a shown signature in place", async () => {
    const { handle, textbox } = await renderEditor({
      initialHtml: "<div>Body</div>",
      mode: "original",
      preservedBlocks: [
        { id: "signature", kind: "signature", html: "<div>Old</div>" },
      ],
    });
    fireEvent.click(await screen.findByRole("button", { name: /^Show/u }));

    await act(async () => {
      handle().replaceSignature("<div>New</div>");
    });

    expect(textbox().textContent).toContain("New");
    expect(textbox().textContent).not.toContain("Old");
  });

  it("swaps in an image signature that shows proxied and sends its original URL", async () => {
    const resolveRemoteImages = vi.fn(async (sources: string[]) =>
      Object.fromEntries(
        sources.map((source) => [
          source,
          `/api/image-proxy?u=${encodeURIComponent(source)}`,
        ]),
      ),
    );
    const { handle, textbox } = await renderEditor({
      initialHtml: "<div>Body</div>",
      mode: "original",
      preservedBlocks: [
        { id: "signature", kind: "signature", html: "<div>Old</div>" },
      ],
      resolveRemoteImages,
    });
    fireEvent.click(await screen.findByRole("button", { name: /^Show/u }));

    await act(async () => {
      handle().replaceSignature(SIGNATURE_FIXTURES.tableWithLogo);
    });

    const logo = textbox().querySelector("[data-smartmail] table img");
    expect(logo?.getAttribute("src")).toBe(
      "/api/image-proxy?u=https%3A%2F%2Fassets.example.com%2Flogo.png",
    );
    const { editableHtml } = handle().getValue();
    expect(editableHtml).toContain('src="https://assets.example.com/logo.png"');
    expect(editableHtml).toContain('alt="Example Company"');
    expect(editableHtml).toContain("<table");
    expect(editableHtml).not.toContain("image-proxy");
    expect(editableHtml).not.toContain("data-original-src");
    expect(editableHtml).not.toContain("Old");
  });

  it.each(
    Object.entries(SIGNATURE_FIXTURES),
  )("keeps a %s signature intact when swapped in while collapsed", async (_name, html) => {
    const { handle, textbox } = await renderEditor({
      initialHtml: "<div>Body</div>",
      mode: "original",
      preservedBlocks: [
        { id: "signature", kind: "signature", html: "<div>Old</div>" },
      ],
    });

    await act(async () => {
      handle().replaceSignature(html);
    });

    expect(textbox().textContent).toBe("Body");
    const sent = new DOMParser().parseFromString(
      handle().getValue().editableHtml,
      "text/html",
    );
    const signature = sent.querySelector("[data-smartmail]");
    const expected = new DOMParser().parseFromString(html, "text/html").body;
    expect(signature?.textContent?.replace(/\s+/gu, "")).toBe(
      expected.textContent?.replace(/\s+/gu, ""),
    );
    expect(signature?.querySelectorAll("img").length).toBe(
      expected.querySelectorAll("img").length,
    );
    expect(sent.body.textContent).not.toContain("Old");
  });

  it("adds a signature to a message without one and removes it again", async () => {
    const { handle } = await renderEditor({
      initialHtml: "<div>Body</div>",
      mode: "original",
    });

    await act(async () => {
      handle().replaceSignature("<div>New</div>");
    });
    expect(screen.getByRole("button", { name: "Show signature" })).toBeTruthy();
    expect(handle().getValue().editableHtml).toContain("New");

    await act(async () => {
      handle().replaceSignature("");
    });
    expect(screen.queryByRole("button", { name: /signature/u })).toBeNull();
    expect(handle().getValue().editableHtml).not.toContain("New");
  });

  it("keeps text typed below the signature below it when collapsed", async () => {
    const { handle, textbox } = await renderEditor({
      initialHtml: "<div>Body</div>",
      mode: "original",
      preservedBlocks: [
        { id: "signature", kind: "signature", html: "<div>Sig</div>" },
      ],
    });
    fireEvent.click(await screen.findByRole("button", { name: /^Show/u }));
    const postscript = document.createElement("div");
    postscript.textContent = "PS";
    await act(async () => {
      textbox().append(postscript);
    });

    fireEvent.click(await screen.findByRole("button", { name: /^Hide/u }));
    await act(async () => {});

    expect(textbox().textContent).toBe("Body");
    expect(handle().getValue().editableHtml).toMatch(
      /<div data-smartmail="gmail_signature">.*Sig.*<\/div><div>PS<\/div>$/u,
    );
  });

  it("does not treat signature markers in other content as the signature", async () => {
    const { textbox } = await renderEditor({
      initialHtml:
        '<div>Forwarded<div data-smartmail="gmail_signature">Someone else</div></div>',
      mode: "original",
      preservedBlocks: [
        { id: "signature", kind: "signature", html: "<div>Mine</div>" },
      ],
    });

    expect(textbox().textContent).toContain("Someone else");
    fireEvent.click(await screen.findByRole("button", { name: /^Show/u }));
    expect(textbox().textContent).toContain("Mine");
  });

  it("strips signature markers from inserted HTML", async () => {
    const { handle, textbox } = await renderEditor({});

    await act(async () => {
      handle().insertHtml(
        '<div data-smartmail="gmail_signature">Snippet</div>',
      );
    });

    expect(textbox().textContent).toContain("Snippet");
    expect(textbox().querySelector("[data-smartmail]")).toBeNull();
    expect(screen.queryByRole("button", { name: /signature/u })).toBeNull();
  });

  it("quotes text and leaves the caret on a new line below it", async () => {
    const { handle, textbox } = await renderEditor({});

    act(() => {
      handle().insertQuote("First <line>\nSecond line");
      handle().insertText("My answer");
    });

    expect(textbox().innerHTML).toBe(
      "<blockquote><div>First &lt;line&gt;</div><div>Second line</div></blockquote><div>My answer</div>",
    );
  });

  it("keeps a quote off a line that already has text", async () => {
    const { handle } = await renderEditor({
      initialHtml: "<div>Thanks</div>",
      mode: "edited",
    });

    act(() => {
      handle().insertQuote("Quoted");
      handle().insertText("Reply");
    });

    expect(handle().getValue().editableHtml).toBe(
      "<div>Thanks</div><blockquote><div>Quoted</div></blockquote><div>Reply</div>",
    );
  });

  it("collapses a signature restored from an earlier session", async () => {
    const { handle, textbox } = await renderEditor({
      initialHtml:
        '<div>Reply</div><div data-smartmail="gmail_signature"><div>Example Person</div></div>',
      mode: "edited",
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
      mode: "original",
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
      mode: "original",
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
      mode: "original",
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

  it("leaves keys that confirm IME composition to the input method", async () => {
    const onSlashKeyDown = vi.fn(() => true);
    const { handle, textbox } = await renderEditor({
      onSlashKeyDown,
      onSlashTrigger: vi.fn(),
    });
    await act(async () => {
      handle().insertText("/");
    });

    const composing = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      isComposing: true,
      key: "Enter",
    });
    textbox().dispatchEvent(composing);
    textbox().dispatchEvent(new CompositionEvent("compositionend"));
    const justAfter = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
    });
    textbox().dispatchEvent(justAfter);

    expect(onSlashKeyDown).not.toHaveBeenCalled();
    expect(composing.defaultPrevented).toBe(false);
    expect(justAfter.defaultPrevented).toBe(false);
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

  it("treats a host with a port as a web address", async () => {
    const { textbox } = await renderEditor({});
    act(() => {
      fireEvent.keyDown(textbox(), { key: "k", ctrlKey: true });
    });
    fireEvent.change(screen.getByLabelText("Link address"), {
      target: { value: "example.com:8080/docs" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(textbox().querySelector("a")?.getAttribute("href")).toBe(
      "https://example.com:8080/docs",
    );
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

  it.each([
    "ftp://files.example.com",
    "ftp:files",
  ])("rejects links with unsupported schemes: %s", async (address) => {
    const { textbox } = await renderEditor({});

    act(() => {
      fireEvent.keyDown(textbox(), { key: "k", ctrlKey: true });
    });
    fireEvent.change(screen.getByLabelText("Link address"), {
      target: { value: address },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByRole("alert").textContent).toContain("safe");
    expect(textbox().querySelector("a")).toBeNull();
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
      initialHtml=""
      onStateChange={onStateChange}
      ref={ref}
      {...props}
    />,
  );
  // The Squire engine is loaded lazily, and fills the textbox only once it
  // attaches, which is when it makes the root editable.
  const root = await screen.findByRole("textbox", { name: "Email message" });
  await waitFor(() =>
    expect(root.getAttribute("contenteditable")).toBe("true"),
  );
  return {
    handle: () => {
      if (!ref.current) throw new Error("Editor handle is not ready");
      return ref.current;
    },
    onStateChange,
    textbox: () => screen.getByRole("textbox", { name: "Email message" }),
  };
}

// Selects from the end of the body through the signature and deletes it, the
// way a user removes a signature they don't want.
async function deleteSignature(textbox: HTMLElement) {
  const signature = textbox.querySelector("[data-smartmail]");
  if (!signature?.previousSibling) throw new Error("No signature to delete");
  const range = document.createRange();
  range.setStart(
    signature.previousSibling,
    signature.previousSibling.childNodes.length,
  );
  range.setEnd(textbox, textbox.childNodes.length);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent.keyDown(textbox, { key: "Backspace" });
  // Squire reports the edit asynchronously.
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: /signature/u })).toBeNull(),
  );
}
