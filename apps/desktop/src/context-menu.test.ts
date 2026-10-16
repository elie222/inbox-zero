import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it, vi } from "vitest";
import { buildDesktopContextMenuTemplate } from "./context-menu";

vi.mock("electron", () => ({}));

describe("desktop context menu", () => {
  it("offers copy and lookup for text selected in an email", () => {
    const actions = createActions();
    const template = build({ selectionText: "quarterly numbers" }, actions);

    expect(labels(template)).toEqual([
      "Look Up “quarterly numbers”",
      "Search with Google for “quarterly numbers”",
      "---",
      "copy",
      "---",
      "shareMenu",
      "Speech",
    ]);

    click(template, "Search with Google for “quarterly numbers”");
    expect(actions.openExternal).toHaveBeenCalledWith(
      "https://www.google.com/search?q=quarterly%20numbers",
    );
  });

  it("leaves out macOS-only items on Windows", () => {
    const template = build(
      { selectionText: "hello" },
      createActions(),
      "win32",
    );

    expect(labels(template)).toEqual([
      "Search with Google for “hello”",
      "---",
      "copy",
    ]);
  });

  it("offers spelling suggestions and editing commands in the composer", () => {
    const actions = createActions();
    const template = build(
      {
        isEditable: true,
        misspelledWord: "recieve",
        dictionarySuggestions: ["receive", "relieve"],
        editFlags: editFlags({ canCopy: false }),
      },
      actions,
    );

    expect(labels(template)).toEqual([
      "receive",
      "relieve",
      "Add to Dictionary",
      "---",
      "cut",
      "copy",
      "paste",
      "pasteAndMatchStyle",
      "selectAll",
      "---",
      "Emoji & Symbols",
    ]);
    expect(template.find((item) => item.role === "copy")?.enabled).toBe(false);

    click(template, "receive");
    expect(actions.replaceMisspelling).toHaveBeenCalledWith("receive");
    click(template, "Add to Dictionary");
    expect(actions.addToDictionary).toHaveBeenCalledWith("recieve");
  });

  it("copies the bare address from a mailto link", () => {
    const actions = createActions();
    const template = build(
      { linkURL: "mailto:jane%2Bnews@example.com?subject=Hi" },
      actions,
    );

    expect(labels(template)).toEqual(["Copy Email Address"]);
    click(template, "Copy Email Address");
    expect(actions.copyText).toHaveBeenCalledWith("jane+news@example.com");
  });

  it("falls back to the raw address when a mailto link is malformed", () => {
    const actions = createActions();
    const template = build({ linkURL: "mailto:a%ZZ@example.com" }, actions);

    click(template, "Copy Email Address");
    expect(actions.copyText).toHaveBeenCalledWith("a%ZZ@example.com");
  });

  it("opens and copies web links", () => {
    const actions = createActions();
    const template = build({ linkURL: "https://example.com/a" }, actions);

    expect(labels(template)).toEqual(["Open Link in Browser", "Copy Link"]);
    click(template, "Open Link in Browser");
    expect(actions.openExternal).toHaveBeenCalledWith("https://example.com/a");
  });

  it("ignores links with unsupported protocols", () => {
    const template = build({ linkURL: "javascript:alert(1)" }, createActions());

    expect(template).toEqual([]);
  });

  it("saves and copies images, without an address for inline data", () => {
    const actions = createActions();
    const remote = build(
      {
        mediaType: "image",
        hasImageContents: true,
        srcURL: "https://example.com/logo.png",
        x: 10,
        y: 20,
      },
      actions,
    );
    expect(labels(remote)).toEqual([
      "Save Image As…",
      "Copy Image",
      "Copy Image Address",
    ]);
    click(remote, "Copy Image");
    expect(actions.copyImageAt).toHaveBeenCalledWith(10, 20);

    const inline = build(
      {
        mediaType: "image",
        hasImageContents: true,
        srcURL: "data:image/png;base64,AAAA",
      },
      actions,
    );
    expect(labels(inline)).toEqual(["Save Image As…", "Copy Image"]);
  });

  it("shows nothing on empty space in production", () => {
    expect(build({}, createActions())).toEqual([]);
  });

  it("adds Inspect Element in development", () => {
    const template = buildDesktopContextMenuTemplate(
      params({}),
      createActions(),
      { platform: "darwin", isDevelopment: true },
    );

    expect(labels(template)).toEqual(["Inspect Element"]);
  });
});

function build(
  overrides: Partial<Parameters<typeof buildDesktopContextMenuTemplate>[0]>,
  actions: ReturnType<typeof createActions>,
  platform: NodeJS.Platform = "darwin",
) {
  return buildDesktopContextMenuTemplate(params(overrides), actions, {
    platform,
    isDevelopment: false,
  });
}

function params(
  overrides: Partial<Parameters<typeof buildDesktopContextMenuTemplate>[0]>,
): Parameters<typeof buildDesktopContextMenuTemplate>[0] {
  return {
    x: 0,
    y: 0,
    linkURL: "",
    srcURL: "",
    mediaType: "none",
    hasImageContents: false,
    isEditable: false,
    selectionText: "",
    misspelledWord: "",
    dictionarySuggestions: [],
    editFlags: editFlags(),
    ...overrides,
  };
}

function editFlags(
  overrides: Partial<
    Parameters<typeof buildDesktopContextMenuTemplate>[0]["editFlags"]
  > = {},
) {
  return {
    canUndo: true,
    canRedo: true,
    canCut: true,
    canCopy: true,
    canPaste: true,
    canDelete: true,
    canSelectAll: true,
    canEditRichly: true,
    ...overrides,
  };
}

function createActions() {
  return {
    copyText: vi.fn(),
    copyImageAt: vi.fn(),
    saveUrl: vi.fn(),
    openExternal: vi.fn(),
    lookUpSelection: vi.fn(),
    replaceMisspelling: vi.fn(),
    addToDictionary: vi.fn(),
    showEmojiPanel: vi.fn(),
    inspectElementAt: vi.fn(),
  };
}

function labels(template: MenuItemConstructorOptions[]) {
  return template.map((item) =>
    item.type === "separator" ? "---" : (item.label ?? item.role),
  );
}

function click(template: MenuItemConstructorOptions[], label: string) {
  template
    .find((item) => item.label === label)
    ?.click?.({} as never, {} as never, {} as never);
}
