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

const { fetchAttachment, queueAttachmentDownload } = vi.hoisted(() => ({
  fetchAttachment: vi.fn(),
  queueAttachmentDownload: vi.fn(
    ({ download }: { download: (signal: AbortSignal) => Promise<unknown> }) =>
      download(new AbortController().signal),
  ),
}));
vi.mock("@/utils/attachments/download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/attachments/download")>()),
  fetchAttachment,
}));
// jsdom's Blob lacks arrayBuffer(), which the image signature check needs.
vi.mock("@inboxzero/mail-ui/image-preview", () => ({
  getAttachmentImagePreview: async (blob: Blob) => blob,
}));
vi.mock("@/utils/attachments/download-queue", () => ({
  queueAttachmentDownload,
}));

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
import type { ParsedMessage } from "@/utils/types";

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
      vi.fn(async (_input: string, init?: RequestInit) =>
        Response.json({ html: JSON.parse(String(init?.body)).html }),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("applies the resolved system theme to the email document", async () => {
    mockTheme.theme = "system";
    mockTheme.resolvedTheme = "dark";
    const { findByTitle } = render(
      <HtmlEmail html="<p>Hello</p>" messageId="system-theme" />,
    );
    const iframe = (await findByTitle(
      "Email content preview",
    )) as HTMLIFrameElement;
    const document = new DOMParser().parseFromString(
      iframe.srcdoc,
      "text/html",
    );
    expect(iframe.style.colorScheme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.body.classList.contains("dark")).toBe(true);
  });

  it("does not put designed html emails into the app dark color scheme", async () => {
    mockTheme.theme = "dark";
    mockTheme.resolvedTheme = "dark";
    const html = `<html><head><style>
      .card { background: #f8f9fa; color: #202124; }
      @media (prefers-color-scheme: dark) {
        .card { background: #202124; color: #e8eaed; }
      }
    </style></head><body>
      <div class="card" style="background:#f8f9fa;font-family:Arial,sans-serif;font-size:16px">
        Finish setup
      </div>
      <pre>prefers-color-scheme: dark</pre>
    </body></html>`;
    const { findByTitle } = render(
      <HtmlEmail html={html} messageId="designed-theme" />,
    );
    const iframe = (await findByTitle(
      "Email content preview",
    )) as HTMLIFrameElement;
    const document = new DOMParser().parseFromString(
      iframe.srcdoc,
      "text/html",
    );
    expect(iframe.style.colorScheme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.body.classList.contains("dark")).toBe(false);
    expect(
      document
        .querySelector('meta[name="color-scheme"]')
        ?.getAttribute("content"),
    ).toBe("light");
    expect(iframe.srcdoc).toContain(
      "prefers-color-scheme: inbox-zero-authored",
    );
    expect(document.querySelector("pre")?.textContent).toBe(
      "prefers-color-scheme: dark",
    );
  });

  it("treats uppercase designed markup as authored html", async () => {
    mockTheme.theme = "dark";
    mockTheme.resolvedTheme = "dark";
    const html = `<HTML><HEAD><STYLE>
      .card { background: #f8f9fa; color: #202124; }
      @media (prefers-color-scheme: dark) {
        .card { background: #202124; color: #e8eaed; }
      }
    </STYLE></HEAD><BODY>
      <DIV CLASS="card" STYLE="background:#f8f9fa;font-family:Arial,sans-serif;font-size:16px">
        Finish setup
      </DIV>
    </BODY></HTML>`;
    const { findByTitle } = render(
      <HtmlEmail html={html} messageId="designed-theme-uppercase" />,
    );
    const iframe = (await findByTitle(
      "Email content preview",
    )) as HTMLIFrameElement;
    expect(iframe.style.colorScheme).toBe("light");
    expect(iframe.srcdoc).toContain(
      "prefers-color-scheme: inbox-zero-authored",
    );
  });

  it("waits for proxied html instead of loading remote images directly", async () => {
    const preparation = Promise.withResolvers<Response>();
    vi.mocked(fetch).mockReturnValue(preparation.promise);
    const { container, findByTitle, queryByTitle } = render(
      <HtmlEmail
        html='<img src="https://cdn.example.com/photo.png" />'
        messageId="awaits-proxy"
      />,
    );

    expect(queryByTitle("Email content preview")).toBeNull();
    expect(
      container.querySelector('[data-email-ready="false"]'),
    ).not.toBeNull();

    await act(async () =>
      preparation.resolve(
        Response.json({
          html: '<img src="https://app.example.com/api/image-proxy?u=photo" />',
        }),
      ),
    );
    const iframe = await findByTitle("Email content preview");
    expect(iframe.getAttribute("srcdoc")).toContain("/api/image-proxy?u=photo");
    expect(iframe.getAttribute("srcdoc")).not.toContain(
      "https://cdn.example.com/photo.png",
    );
    expect(queryByTitle("Preparing email content preview")).toBeNull();
  });

  it("shows prepared html immediately when the email is reopened", async () => {
    const html = "<p>Hello</p>";
    vi.mocked(fetch).mockImplementation(async () =>
      Response.json({ html: "<p>proxied</p>" }),
    );

    const firstRender = render(<HtmlEmail html={html} messageId="message-1" />);
    await firstRender.findByTitle("Email content preview");
    firstRender.unmount();

    const { getByTitle } = render(
      <HtmlEmail html={html} messageId="message-1" />,
    );

    const iframe = getByTitle("Email content preview") as HTMLIFrameElement;
    expect(iframe.getAttribute("srcdoc")).toContain("<p>proxied</p>");
    expect(iframe.style.height).toBe("");
    await act(async () => {});
    expect(fetch).toHaveBeenCalledOnce();
  });

  // A sent reply keeps its row when the provider's copy replaces the outgoing
  // one, and that copy needs its own proxy preparation.
  it("keeps the current body on screen while a new message id is prepared", async () => {
    const view = render(
      <HtmlEmail html="<p>Reply</p>" messageId="outgoing:send-1" />,
    );
    const frame = await view.findByTitle("Email content preview");
    const preparation = Promise.withResolvers<Response>();
    vi.mocked(fetch).mockReturnValue(preparation.promise);

    view.rerender(
      <HtmlEmail html="<p>Reply</p><p>Sent</p>" messageId="sent-1" />,
    );
    await act(async () => {});

    expect(view.getByTitle("Email content preview")).toBe(frame);

    await act(async () =>
      preparation.resolve(Response.json({ html: "<p>Reply</p><p>Sent</p>" })),
    );
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

    const { findByTitle } = render(
      <HtmlEmail
        html={'<img src="https://cdn.example.com/photo.png" />'}
        messageId="message-2"
      />,
    );

    const iframe = await findByTitle("Email content preview");
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

    const { findByTitle } = render(
      <HtmlEmail
        html={'<img src="https://cdn.example.com/photo.png" />'}
        messageId="message-3"
      />,
    );

    const iframe = await findByTitle("Email content preview");
    expect(iframe.getAttribute("srcdoc")).toContain(
      "img-src data: https://app.example.com;",
    );
  });

  it("does not grow when the document reports the iframe viewport height", async () => {
    const { findByTitle } = render(
      <HtmlEmail html="<p>Short reply</p>" messageId="short-reply" />,
    );
    const iframe = (await findByTitle(
      "Email content preview",
    )) as HTMLIFrameElement;
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

  it("rounds a fractional document height up so the frame never scrolls", async () => {
    const { findByTitle } = render(
      <HtmlEmail html="<p>Three lines</p>" messageId="fractional-height" />,
    );
    const iframe = (await findByTitle(
      "Email content preview",
    )) as HTMLIFrameElement;
    const { documentElement } = iframe.contentDocument!;
    Object.defineProperty(documentElement, "scrollHeight", {
      configurable: true,
      get: () => 67,
    });
    vi.spyOn(documentElement, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 600, 67.17),
    );
    addEmailDocumentMarker(iframe, iframe.contentDocument);
    iframe.dispatchEvent(new Event("load"));

    await waitFor(() => expect(iframe.style.height).toBe("68px"));
  });

  it("expands when an image increases the iframe document height after loading", async () => {
    const { findByTitle } = render(
      <HtmlEmail
        html='<img src="https://cdn.example.com/tall-image.png" />'
        messageId="message-tall-image"
      />,
    );
    const iframe = (await findByTitle(
      "Email content preview",
    )) as HTMLIFrameElement;
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

  it("runs archive and snooze shortcuts from a focused email body", async () => {
    const archive = vi.fn();
    const snooze = vi.fn();
    function MailShortcuts() {
      useShortcuts({ archive, snooze });
      return (
        <HtmlEmail html="<p>Message body</p>" messageId="message-shortcuts" />
      );
    }
    const { findByTitle } = render(
      <ShortcutsProvider scopes={["global", "mail"]}>
        <MailShortcuts />
      </ShortcutsProvider>,
    );
    const iframe = (await findByTitle(
      "Email content preview",
    )) as HTMLIFrameElement;
    measureEmailFrame(iframe, 40);
    await waitFor(() => expect(iframe.style.height).toBe("40px"));
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

  it("bubbles unhandled email keys to the app without stealing typing", async () => {
    const { findByTitle } = render(
      <HtmlEmail html="<p>Message body</p>" messageId="message-shortcuts" />,
    );
    const iframe = (await findByTitle(
      "Email content preview",
    )) as HTMLIFrameElement;
    measureEmailFrame(iframe, 40);
    await waitFor(() => expect(iframe.style.height).toBe("40px"));
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

  it("forwards with F while focus is inside the email document", async () => {
    const onForwardMessage = vi.fn();
    const { findByTitle } = render(
      <HtmlEmail
        html="<p>Message body</p>"
        messageId="message-forward"
        onForwardMessage={onForwardMessage}
      />,
    );
    const iframe = (await findByTitle(
      "Email content preview",
    )) as HTMLIFrameElement;
    measureEmailFrame(iframe, 40);
    await waitFor(() => expect(iframe.style.height).toBe("40px"));

    fireEvent.keyDown(iframe.contentDocument!.body, { key: "f" });

    expect(onForwardMessage).toHaveBeenCalledOnce();
  });

  it("keeps the reply frame mounted while quoted content opens and closes", async () => {
    const { findByTitle, getByRole, getByTitle, getAllByTitle } = render(
      <HtmlEmail
        html={
          '<div>Current reply</div><div class="gmail_quote"><div>Earlier message</div></div>'
        }
        messageId="message-with-quote"
      />,
    );
    const initial = (await findByTitle(
      "Email content preview",
    )) as HTMLIFrameElement;
    measureEmailFrame(initial, 40);
    await waitFor(() => expect(initial.style.height).toBe("40px"));
    fireEvent.click(getByRole("button", { name: "Show quoted content" }));
    const expanded = getAllByTitle(
      "Email content preview",
    )[1] as HTMLIFrameElement;
    expect(initial.style.height).toBe("40px");
    expect(expanded.srcdoc).toContain("Earlier message");
    expect(expanded.srcdoc).not.toContain("Current reply");
    measureEmailFrame(expanded, 640);
    await waitFor(() => expect(expanded.style.height).toBe("640px"));
    fireEvent.click(getByRole("button", { name: "Hide quoted content" }));
    expect(getByTitle("Email content preview")).toBe(initial);
    expect(initial.style.height).toBe("40px");
  });

  it("keeps watching until the email document replaces the placeholder", async () => {
    const { findByTitle } = render(
      <HtmlEmail html="<p>Long email</p>" messageId="message-loading" />,
    );
    const iframe = (await findByTitle(
      "Email content preview",
    )) as HTMLIFrameElement;
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

  it("resolves cid images larger than the attachment preview budget to local URLs", async () => {
    const html = '<img src="cid:screenshot@inboxzero.local" />';
    const objectUrl = "blob:https://app.example.com/inline-image";
    fetchAttachment.mockResolvedValue(
      new Blob(["image"], { type: "image/png" }),
    );
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

    const { findByTitle, unmount } = render(
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
            size: 4 * 1024 * 1024,
          },
        ]}
        messageId="message-inline"
      />,
    );

    const iframe = await findByTitle("Email content preview");
    expect(iframe.getAttribute("srcdoc")).toContain(`src="${objectUrl}"`);
    expect(iframe.getAttribute("srcdoc")).toContain(
      "img-src data: blob: https:;",
    );
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(queueAttachmentDownload).toHaveBeenCalledWith(
      expect.objectContaining({ priority: "requested" }),
    );
    expect(fetchAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("attachmentId=attachment-1"),
        emailAccountId: "account-1",
      }),
    );

    unmount();
    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });

  it("keeps loaded cid images when the message is republished with the same attachments", async () => {
    const html = '<img src="cid:logo@inboxzero.local" />';
    fetchAttachment.mockResolvedValue(
      new Blob(["image"], { type: "image/png" }),
    );
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation(
        () =>
          `blob:https://app.example.com/logo-${createObjectUrl.mock.calls.length}`,
      );
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ html }) }),
    );
    const inlineAttachment = () => ({
      attachmentId: "attachment-logo",
      filename: "logo.png",
      headers: {
        "content-description": "",
        "content-id": "<logo@inboxzero.local>",
        "content-transfer-encoding": "base64",
        "content-type": "image/png",
      },
      mimeType: "image/png",
      size: 1024,
    });
    const renderEmail = () => (
      <HtmlEmail
        emailAccountId="account-1"
        html={html}
        inlineAttachments={[inlineAttachment()]}
        messageId="message-republished"
      />
    );

    const { getByTitle, queryByTitle, rerender } = render(renderEmail());
    await waitFor(() =>
      expect(
        getByTitle("Email content preview").getAttribute("srcdoc"),
      ).toContain('src="blob:https://app.example.com/logo-1"'),
    );
    const visibleFrame = getByTitle("Email content preview");

    rerender(renderEmail());
    await act(async () => {});

    expect(getByTitle("Email content preview")).toBe(visibleFrame);
    expect(queryByTitle("Preparing email content preview")).toBeNull();
    expect(fetchAttachment).toHaveBeenCalledOnce();
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });

  it("keeps loaded cid images when the message is republished without attachment metadata", async () => {
    const html = '<img src="cid:badge@inboxzero.local" />';
    const objectUrl = "blob:https://app.example.com/badge";
    fetchAttachment.mockResolvedValue(
      new Blob(["image"], { type: "image/png" }),
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue(objectUrl);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ html }) }),
    );
    const renderEmail = (inlineAttachments: ParsedMessage["inline"]) => (
      <HtmlEmail
        emailAccountId="account-1"
        html={html}
        inlineAttachments={inlineAttachments}
        messageId="message-sync-republished"
      />
    );

    const { getByTitle, queryByTitle, rerender } = render(
      renderEmail([inlineImageAttachment("badge@inboxzero.local")]),
    );
    await waitFor(() =>
      expect(
        getByTitle("Email content preview").getAttribute("srcdoc"),
      ).toContain(`src="${objectUrl}"`),
    );

    rerender(renderEmail([]));
    await act(async () => {});

    expect(queryByTitle("Preparing email content preview")).toBeNull();
    expect(
      getByTitle("Email content preview").getAttribute("srcdoc"),
    ).toContain(`src="${objectUrl}"`);
    expect(fetchAttachment).toHaveBeenCalledOnce();
  });

  it("shows loaded cid images immediately when the email is reopened", async () => {
    const html = '<img src="cid:chart@inboxzero.local" />';
    const objectUrl = "blob:https://app.example.com/chart";
    fetchAttachment.mockResolvedValue(
      new Blob(["image"], { type: "image/png" }),
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue(objectUrl);
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ html }) }),
    );
    const renderEmail = () => (
      <HtmlEmail
        emailAccountId="account-1"
        html={html}
        inlineAttachments={[inlineImageAttachment("chart@inboxzero.local")]}
        messageId="message-reopened-inline"
      />
    );

    const firstRender = render(renderEmail());
    await waitFor(() =>
      expect(
        firstRender.getByTitle("Email content preview").getAttribute("srcdoc"),
      ).toContain(`src="${objectUrl}"`),
    );
    firstRender.unmount();

    const { getByTitle } = render(renderEmail());

    expect(
      getByTitle("Email content preview").getAttribute("srcdoc"),
    ).toContain(`src="${objectUrl}"`);
    await act(async () => {});
    expect(fetchAttachment).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });

  it("does not revoke inline images of mounted messages when the cache is full", async () => {
    fetchAttachment.mockResolvedValue(
      new Blob(["image"], { type: "image/png" }),
    );
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation(
        () =>
          `blob:https://app.example.com/thread-${createObjectUrl.mock.calls.length}`,
      );
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string, init?: RequestInit) =>
        Response.json({ html: JSON.parse(String(init?.body)).html }),
      ),
    );
    const messageIds = Array.from(
      { length: 21 },
      (_, index) => `message-long-thread-${index}`,
    );

    const { unmount } = render(
      <div>
        {messageIds.map((messageId) => (
          <HtmlEmail
            key={messageId}
            emailAccountId="account-1"
            html={`<img src="cid:${messageId}@inboxzero.local" />`}
            inlineAttachments={[
              inlineImageAttachment(`${messageId}@inboxzero.local`),
            ]}
            messageId={messageId}
          />
        ))}
      </div>,
    );
    await waitFor(() => expect(createObjectUrl).toHaveBeenCalledTimes(21));
    const threadUrls = createObjectUrl.mock.results.map(
      (result) => result.value,
    );
    const revokedThreadUrls = () =>
      revokeObjectUrl.mock.calls.filter(([url]) => threadUrls.includes(url));

    expect(revokedThreadUrls()).toEqual([]);

    unmount();
    expect(revokedThreadUrls()).not.toEqual([]);
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

function inlineImageAttachment(contentId: string) {
  return {
    attachmentId: `attachment-${contentId}`,
    filename: "image.png",
    headers: {
      "content-description": "",
      "content-id": `<${contentId}>`,
      "content-transfer-encoding": "base64",
      "content-type": "image/png",
    },
    mimeType: "image/png",
    size: 1024,
  };
}

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
