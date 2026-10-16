import {
  app,
  BrowserWindow,
  clipboard,
  type ContextMenuParams,
  Menu,
  type MenuItemConstructorOptions,
  type WebContents,
} from "electron";

const MAX_LABEL_SELECTION_LENGTH = 24;

type ContextMenuActions = {
  copyText: (text: string) => void;
  copyImageAt: (x: number, y: number) => void;
  saveUrl: (url: string) => void;
  openExternal: (url: string) => void;
  lookUpSelection: () => void;
  replaceMisspelling: (word: string) => void;
  addToDictionary: (word: string) => void;
  showEmojiPanel: () => void;
  inspectElementAt: (x: number, y: number) => void;
};

type ContextMenuParamsInput = Pick<
  ContextMenuParams,
  | "x"
  | "y"
  | "linkURL"
  | "srcURL"
  | "mediaType"
  | "hasImageContents"
  | "isEditable"
  | "selectionText"
  | "misspelledWord"
  | "dictionarySuggestions"
  | "editFlags"
>;

export function installDesktopContextMenu(
  contents: WebContents,
  { openExternal }: { openExternal: (url: string) => void },
) {
  const actions: ContextMenuActions = {
    copyText: (text) => clipboard.writeText(text),
    copyImageAt: (x, y) => contents.copyImageAt(x, y),
    saveUrl: (url) => contents.downloadURL(url),
    openExternal,
    lookUpSelection: () => contents.showDefinitionForSelection(),
    replaceMisspelling: (word) => contents.replaceMisspelling(word),
    addToDictionary: (word) => {
      contents.session.addWordToSpellCheckerDictionary(word);
    },
    showEmojiPanel: () => app.showEmojiPanel(),
    inspectElementAt: (x, y) => contents.inspectElement(x, y),
  };

  contents.on("context-menu", (_event, params) => {
    const template = buildDesktopContextMenuTemplate(params, actions, {
      platform: process.platform,
      isDevelopment: !app.isPackaged,
    });
    if (template.length === 0) return;
    Menu.buildFromTemplate(template).popup({
      window: BrowserWindow.fromWebContents(contents) ?? undefined,
      frame: params.frame ?? undefined,
    });
  });
}

export function buildDesktopContextMenuTemplate(
  params: ContextMenuParamsInput,
  actions: ContextMenuActions,
  {
    platform,
    isDevelopment,
  }: { platform: NodeJS.Platform; isDevelopment: boolean },
): MenuItemConstructorOptions[] {
  const isMac = platform === "darwin";
  const selection = params.selectionText.trim();
  const sections: MenuItemConstructorOptions[][] = [];

  if (params.isEditable && params.misspelledWord) {
    const suggestions = params.dictionarySuggestions.map(
      (suggestion): MenuItemConstructorOptions => ({
        label: suggestion,
        click: () => actions.replaceMisspelling(suggestion),
      }),
    );
    sections.push([
      ...(suggestions.length > 0
        ? suggestions
        : [{ label: "No Guesses Found", enabled: false }]),
      {
        label: "Add to Dictionary",
        click: () => actions.addToDictionary(params.misspelledWord),
      },
    ]);
  }

  if (selection && !params.isEditable) {
    const quoted = `“${truncate(selection)}”`;
    sections.push([
      ...(isMac
        ? [
            {
              label: `Look Up ${quoted}`,
              click: actions.lookUpSelection,
            },
          ]
        : []),
      {
        label: `Search with Google for ${quoted}`,
        click: () =>
          actions.openExternal(
            `https://www.google.com/search?q=${encodeURIComponent(selection)}`,
          ),
      },
    ]);
  }

  const linkSection = buildLinkSection(params.linkURL, actions);
  if (linkSection.length > 0) sections.push(linkSection);

  if (params.mediaType === "image" && params.hasImageContents) {
    sections.push(buildImageSection(params, actions));
  }

  if (params.isEditable) {
    sections.push([
      { role: "cut", enabled: params.editFlags.canCut },
      { role: "copy", enabled: params.editFlags.canCopy },
      { role: "paste", enabled: params.editFlags.canPaste },
      ...(isMac
        ? [
            {
              role: "pasteAndMatchStyle" as const,
              enabled: params.editFlags.canPaste,
            },
          ]
        : []),
      { role: "selectAll", enabled: params.editFlags.canSelectAll },
    ]);
    if (isMac || platform === "win32") {
      sections.push([
        {
          label: isMac ? "Emoji & Symbols" : "Emoji",
          click: actions.showEmojiPanel,
        },
      ]);
    }
  } else if (selection) {
    sections.push([{ role: "copy" }]);
  }

  if (selection && isMac) {
    sections.push([
      { role: "shareMenu", sharingItem: { texts: [selection] } },
      {
        label: "Speech",
        submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }],
      },
    ]);
  }

  if (isDevelopment) {
    sections.push([
      {
        label: "Inspect Element",
        click: () => actions.inspectElementAt(params.x, params.y),
      },
    ]);
  }

  return sections.flatMap((section, index) =>
    index === 0 ? section : [{ type: "separator" as const }, ...section],
  );
}

function buildLinkSection(
  linkURL: string,
  actions: ContextMenuActions,
): MenuItemConstructorOptions[] {
  const url = URL.parse(linkURL);
  if (!url) return [];

  if (url.protocol === "mailto:") {
    const address = safeDecode(url.pathname);
    return address
      ? [
          {
            label: "Copy Email Address",
            click: () => actions.copyText(address),
          },
        ]
      : [];
  }

  if (url.protocol === "tel:") {
    const phone = safeDecode(url.pathname);
    return phone
      ? [{ label: "Copy Phone Number", click: () => actions.copyText(phone) }]
      : [];
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return [];
  return [
    {
      label: "Open Link in Browser",
      click: () => actions.openExternal(linkURL),
    },
    { label: "Copy Link", click: () => actions.copyText(linkURL) },
  ];
}

function buildImageSection(
  params: ContextMenuParamsInput,
  actions: ContextMenuActions,
): MenuItemConstructorOptions[] {
  const hasRemoteSource = /^https?:/.test(params.srcURL);
  const isSaveable = /^(https?|data|blob):/.test(params.srcURL);
  return [
    ...(isSaveable
      ? [
          {
            label: "Save Image As…",
            click: () => actions.saveUrl(params.srcURL),
          },
        ]
      : []),
    {
      label: "Copy Image",
      click: () => actions.copyImageAt(params.x, params.y),
    },
    ...(hasRemoteSource
      ? [
          {
            label: "Copy Image Address",
            click: () => actions.copyText(params.srcURL),
          },
        ]
      : []),
  ];
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function truncate(text: string) {
  const singleLine = text.replace(/\s+/g, " ");
  return singleLine.length > MAX_LABEL_SELECTION_LENGTH
    ? `${singleLine.slice(0, MAX_LABEL_SELECTION_LENGTH)}…`
    : singleLine;
}
