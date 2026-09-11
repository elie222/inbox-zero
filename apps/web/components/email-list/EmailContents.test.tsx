/** @vitest-environment jsdom */

import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockTheme = vi.hoisted(() => ({
  theme: "light",
  resolvedTheme: "light",
}));

vi.mock("next-themes", () => ({
  useTheme: () => mockTheme,
}));

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BASE_URL: "https://app.example.com",
    NEXT_PUBLIC_IMAGE_PROXY_BASE_URL: "https://img.example.com/proxy",
    NEXT_PUBLIC_IMAGE_PROXY_USE_APP_ROUTE: true,
  },
}));

import { HtmlEmail, PlainEmail } from "./EmailContents";
import { ShortcutsProvider } from "@/lib/shortcuts/ShortcutsProvider";
import { useShortcuts } from "@/lib/shortcuts/useShortcuts";

(globalThis as { React?: typeof React }).React = React;

let triggerResize: (() => void) | undefined;
let animationFrames: Array<{ callback: FrameRequestCallback; id: number }> = [];
let nextAnimationFrameId = 0;

class MockResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    triggerResize = () => callback([], this);
  }

  disconnect() {}
  observe() {}
  unobserve() {}
}

describe("HtmlEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTheme.theme = "light";
    mockTheme.resolvedTheme = "light";
    animationFrames = [];
    nextAnimationFrameId = 0;
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        const id = ++nextAnimationFrameId;
        animationFrames.push({ callback, id });
        return id;
      }),
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      vi.fn((id: number) => {
        animationFrames = animationFrames.filter((frame) => frame.id !== id);
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ html: "<p>proxied</p>" }),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("applies the resolved system theme to the email document", () => {
    mockTheme.theme = "system";
    mockTheme.resolvedTheme = "dark";
    const { getByTitle } = render(
      <HtmlEmail html="<p>Hello</p>" messageId="system-theme" />,
    );
    const iframe = getByTitle("Email content preview") as HTMLIFrameElement;
    const document = new DOMParser().parseFromString(
      iframe.srcdoc,
      "text/html",
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.body.classList.contains("dark")).toBe(true);
  });

  it.each([
    false,
    true,
  ])("keeps the original frame during preparation (measured: %s)", async (measured) => {
    const preparation = Promise.withResolvers<Response>();
    vi.mocked(fetch).mockReturnValue(preparation.promise);
    const { getByTitle, queryByTitle } = render(
      <HtmlEmail
        html="<p>Hello</p>"
        messageId={`buffered-frame-${measured}`}
      />,
    );
    const original = getByTitle("Email content preview") as HTMLIFrameElement;
    if (measured) {
      measureEmailFrame(original, 240);
      await waitFor(() => expect(original.style.height).toBe("240px"));
    }
    await act(async () =>
      preparation.resolve(Response.json({ html: "<p>Prepared hello</p>" })),
    );
    const replacement = getByTitle(
      "Preparing email content preview",
    ) as HTMLIFrameElement;
    expect(getByTitle("Email content preview")).toBe(original);
    expect(original.style.height).toBe(measured ? "240px" : "");
    expect(original.style.visibility).toBe("");
    expect(original.srcdoc).toContain("<p>Hello</p>");
    measureEmailFrame(replacement, 240);
    await waitFor(() =>
      expect(getByTitle("Email content preview")).toBe(replacement),
    );
    expect(queryByTitle("Preparing email content preview")).toBeNull();
    expect(original.isConnected).toBe(false);
    expect(replacement.style.height).toBe("240px");
  });

  it("reuses prepared html without collapsing while measuring the iframe", async () => {
    const html = "<p>Hello</p>";

    const firstRender = render(<HtmlEmail html={html} messageId="message-1" />);
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });
    firstRender.unmount();

    const { getByTitle } = render(
      <HtmlEmail html={html} messageId="message-1" />,
    );
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    const iframe = getByTitle("Email content preview") as HTMLIFrameElement;
    expect(iframe.getAttribute("srcdoc")).toContain("<p>proxied</p>");
    expect(iframe.style.height).toBe("");
  });

  it("keeps https images allowed when proxy rewriting leaves the html unchanged", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          html: '<img src="https://cdn.example.com/photo.png" />',
        }),
      }),
    );

    const { getByTitle } = render(
      <HtmlEmail
        html={'<img src="https://cdn.example.com/photo.png" />'}
        messageId="message-2"
      />,
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    const iframe = getByTitle("Email content preview");
    expect(iframe.getAttribute("srcdoc")).toContain("img-src data: https:;");
  });

  it("locks image loading to the proxy origin after rewriting succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          html: '<img src="https://app.example.com/api/image-proxy?u=https%3A%2F%2Fcdn.example.com%2Fphoto.png&amp;e=1&amp;s=test" />',
        }),
      }),
    );

    const { getByTitle, findByTitle } = render(
      <HtmlEmail
        html={'<img src="https://cdn.example.com/photo.png" />'}
        messageId="message-3"
      />,
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    const iframe = (await findByTitle(
      "Preparing email content preview",
    )) as HTMLIFrameElement;
    measureEmailFrame(iframe, 40);
    await waitFor(() =>
      expect(getByTitle("Email content preview")).toBe(iframe),
    );
    expect(iframe.getAttribute("srcdoc")).toContain(
      "img-src data: https://app.example.com;",
    );
  });

  it("does not grow when the document reports the iframe viewport height", async () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    const { getByTitle } = render(
      <HtmlEmail html="<p>Short reply</p>" messageId="short-reply" />,
    );
    const iframe = getByTitle("Email content preview") as HTMLIFrameElement;
    Object.defineProperty(
      iframe.contentDocument!.documentElement,
      "scrollHeight",
      {
        configurable: true,
        get: () => Math.max(40, Number.parseFloat(iframe.style.height) || 0),
      },
    );
    addEmailDocumentMarker(iframe, iframe.contentDocument);
    iframe.dispatchEvent(new Event("load"));
    await waitFor(() =>
      expect(Number.parseFloat(iframe.style.height)).toBeGreaterThanOrEqual(40),
    );
    const initialHeight = iframe.style.height;
    act(() => triggerResize?.());
    expect(iframe.style.height).toBe(initialHeight);
  });

  it("expands when an image increases the iframe document height after loading", async () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    const { getByTitle } = render(
      <HtmlEmail
        html='<img src="https://cdn.example.com/tall-image.png" />'
        messageId="message-tall-image"
      />,
    );
    const iframe = getByTitle("Email content preview") as HTMLIFrameElement;
    let contentHeight = 40;

    Object.defineProperty(
      iframe.contentDocument!.documentElement,
      "scrollHeight",
      {
        configurable: true,
        get: () => contentHeight,
      },
    );
    addEmailDocumentMarker(iframe, iframe.contentDocument);

    iframe.dispatchEvent(new Event("load"));
    await waitFor(() =>
      expect(Number.parseFloat(iframe.style.height)).toBeGreaterThanOrEqual(40),
    );

    contentHeight = 640;
    act(() => triggerResize?.());

    await waitFor(() =>
      expect(Number.parseFloat(iframe.style.height)).toBeGreaterThanOrEqual(
        640,
      ),
    );
  });

  it("runs archive and snooze shortcuts from a focused email body", () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    const archive = vi.fn();
    const snooze = vi.fn();
    function MailShortcuts() {
      useShortcuts({ archive, snooze });
      return (
        <HtmlEmail html="<p>Message body</p>" messageId="message-shortcuts" />
      );
    }
    const { getByTitle } = render(
      <ShortcutsProvider scopes={["global", "mail"]}>
        <MailShortcuts />
      </ShortcutsProvider>,
    );
    const iframe = getByTitle("Email content preview") as HTMLIFrameElement;
    addEmailDocumentMarker(iframe, iframe.contentDocument);
    iframe.dispatchEvent(new Event("load"));
    iframe.focus();
    for (const [key, code] of [
      ["e", "KeyE"],
      ["h", "KeyH"],
    ]) {
      fireEvent.keyDown(iframe.contentDocument!.body, { key, code });
      fireEvent.keyUp(iframe.contentDocument!.body, { key, code });
    }
    expect(archive).toHaveBeenCalledOnce();
    expect(snooze).toHaveBeenCalledOnce();
  });

  it("bubbles unhandled email keys to the app without stealing typing", () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    const { getByTitle } = render(
      <HtmlEmail html="<p>Message body</p>" messageId="message-shortcuts" />,
    );
    const iframe = getByTitle("Email content preview") as HTMLIFrameElement;
    addEmailDocumentMarker(iframe, iframe.contentDocument);
    iframe.dispatchEvent(new Event("load"));
    const onKey = vi.fn((event: KeyboardEvent) => event.preventDefault());
    document.addEventListener("keydown", onKey);
    try {
      for (const key of ["e", "h"]) {
        expect(fireEvent.keyDown(iframe.contentDocument!.body, { key })).toBe(
          false,
        );
      }
      expect(onKey).toHaveBeenCalledTimes(2);
      const input = iframe.contentDocument!.createElement("input");
      iframe.contentDocument!.body.append(input);
      fireEvent.keyDown(input, { key: "e" });
      fireEvent.keyDown(iframe.contentDocument!.body, {
        key: "e",
        isComposing: true,
      });
      expect(onKey).toHaveBeenCalledTimes(2);
    } finally {
      document.removeEventListener("keydown", onKey);
    }
  });

  it("forwards with F while focus is inside the email document", () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    const onForwardMessage = vi.fn();
    const { getByTitle } = render(
      <HtmlEmail
        html="<p>Message body</p>"
        messageId="message-forward"
        onForwardMessage={onForwardMessage}
      />,
    );
    const iframe = getByTitle("Email content preview") as HTMLIFrameElement;
    addEmailDocumentMarker(iframe, iframe.contentDocument);
    iframe.dispatchEvent(new Event("load"));

    fireEvent.keyDown(iframe.contentDocument!.body, { key: "f" });

    expect(onForwardMessage).toHaveBeenCalledOnce();
  });

  it("keeps the current layout until quoted content is ready to replace it", async () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    const { getByRole, getByTitle } = render(
      <HtmlEmail
        html={
          '<div>Current reply</div><div class="gmail_quote"><div>Earlier message</div></div>'
        }
        messageId="message-with-quote"
      />,
    );
    const initial = getByTitle("Email content preview") as HTMLIFrameElement;
    measureEmailFrame(initial, 40);
    await waitFor(() => expect(initial.style.height).toBe("40px"));
    fireEvent.click(getByRole("button", { name: "Show quoted content" }));
    const expanded = getByTitle(
      "Preparing email content preview",
    ) as HTMLIFrameElement;
    expect(initial.style.height).toBe("40px");
    expect(expanded.getAttribute("height")).toBe("1");
    measureEmailFrame(expanded, 640);
    await waitFor(() =>
      expect(getByTitle("Email content preview")).toBe(expanded),
    );
    fireEvent.click(getByRole("button", { name: "Hide quoted content" }));
    const collapsed = getByTitle(
      "Preparing email content preview",
    ) as HTMLIFrameElement;
    expect(expanded.style.height).toBe("640px");
    measureEmailFrame(collapsed, 40);
    await waitFor(() =>
      expect(getByTitle("Email content preview")).toBe(collapsed),
    );
    expect(collapsed.style.height).toBe("40px");
  });

  it("keeps watching until the email document replaces the placeholder", async () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    const { getByTitle } = render(
      <HtmlEmail html="<p>Long email</p>" messageId="message-loading" />,
    );
    const iframe = getByTitle("Email content preview") as HTMLIFrameElement;
    let iframeDocument = iframe.contentDocument;
    const emailDocument = document.implementation.createHTMLDocument("email");
    addEmailDocumentMarker(iframe, emailDocument);

    Object.defineProperty(emailDocument.documentElement, "scrollHeight", {
      configurable: true,
      value: 640,
    });
    Object.defineProperty(emailDocument.body, "scrollHeight", {
      configurable: true,
      value: 640,
    });
    Object.defineProperty(iframe, "contentDocument", {
      configurable: true,
      get: () => iframeDocument,
    });

    await waitFor(() => expect(animationFrames).not.toHaveLength(0));
    iframe.dispatchEvent(new Event("load"));

    expect(animationFrames).not.toHaveLength(0);
    for (let frame = 0; frame < 10; frame += 1) {
      act(() => animationFrames.shift()?.callback(frame));
    }
    expect(animationFrames).not.toHaveLength(0);

    iframeDocument = emailDocument;
    act(() => animationFrames.shift()?.callback(0));
    expect(animationFrames).toHaveLength(0);

    await waitFor(() =>
      expect(Number.parseFloat(iframe.style.height)).toBeGreaterThanOrEqual(
        640,
      ),
    );
  });

  it("resolves authenticated cid images to temporary local URLs", async () => {
    const html = '<img src="cid:screenshot@inboxzero.local" />';
    const objectUrl = "blob:https://app.example.com/inline-image";
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue(objectUrl);
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: string) =>
        input === "/api/email/render-html"
          ? {
              ok: true,
              json: async () => ({ html }),
            }
          : {
              ok: true,
              blob: async () => new Blob(["image"], { type: "image/png" }),
            },
      ),
    );

    const { getByTitle, unmount } = render(
      <HtmlEmail
        emailAccountId="account-1"
        html={html}
        inlineAttachments={[
          {
            attachmentId: "attachment-1",
            filename: "screenshot.png",
            headers: {
              "content-description": "",
              "content-id": "<screenshot@inboxzero.local>",
              "content-transfer-encoding": "base64",
              "content-type": "image/png",
            },
            mimeType: "image/png",
            size: 5,
          },
        ]}
        messageId="message-inline"
      />,
    );

    await waitFor(() =>
      expect(getByTitle("Preparing email content preview")).toBeDefined(),
    );
    measureEmailFrame(
      getByTitle("Preparing email content preview") as HTMLIFrameElement,
      40,
    );
    await waitFor(() => {
      const iframe = getByTitle("Email content preview");
      expect(iframe.getAttribute("srcdoc")).toContain(`src="${objectUrl}"`);
      expect(iframe.getAttribute("srcdoc")).toContain(
        "img-src data: blob: https:;",
      );
    });
    expect(createObjectUrl).toHaveBeenCalledOnce();

    unmount();
    expect(revokeObjectUrl).toHaveBeenCalledWith(objectUrl);
  });
});

describe("PlainEmail", () => {
  afterEach(() => {
    cleanup();
  });

  it("decodes html entities in plain text email content", () => {
    const text =
      "Hi, I was curious to know-do you have a preference for puzzle games or more action-oriented ones? I&#39;ve found that mobile gaming is such a fascinating way to pass the time, and I&#39;m always";

    const { container } = render(<PlainEmail text={text} />);

    expect(container.textContent).toContain("I've found");
    expect(container.textContent).not.toContain("&#39;");
  });
});

function addEmailDocumentMarker(
  iframe: HTMLIFrameElement,
  targetDocument: Document | null,
) {
  if (!targetDocument) throw new Error("Expected an iframe document");
  const marker = new DOMParser()
    .parseFromString(iframe.srcdoc, "text/html")
    .querySelector('meta[name="inbox-zero-email-document"]');
  if (!marker) throw new Error("Expected an email document marker");
  for (const existingMarker of targetDocument.querySelectorAll(
    'meta[name="inbox-zero-email-document"]',
  )) {
    existingMarker.remove();
  }
  targetDocument.head.append(marker.cloneNode());
}

function measureEmailFrame(iframe: HTMLIFrameElement, height: number) {
  Object.defineProperty(iframe.contentDocument!.body, "scrollHeight", {
    configurable: true,
    value: height,
  });
  addEmailDocumentMarker(iframe, iframe.contentDocument);
  fireEvent.load(iframe);
}
