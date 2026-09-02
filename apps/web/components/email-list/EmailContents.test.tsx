/** @vitest-environment jsdom */

import React from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light" }),
}));

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BASE_URL: "https://app.example.com",
    NEXT_PUBLIC_IMAGE_PROXY_BASE_URL: "https://img.example.com/proxy",
    NEXT_PUBLIC_IMAGE_PROXY_USE_APP_ROUTE: true,
  },
}));

import { HtmlEmail, PlainEmail } from "./EmailContents";

(globalThis as { React?: typeof React }).React = React;

let triggerResize: (() => void) | undefined;
let animationFrameCallbacks: FrameRequestCallback[] = [];

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
    animationFrameCallbacks = [];
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        animationFrameCallbacks.push(callback);
        return animationFrameCallbacks.length;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
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

    const { getByTitle } = render(
      <HtmlEmail
        html={'<img src="https://cdn.example.com/photo.png" />'}
        messageId="message-3"
      />,
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    const iframe = getByTitle("Email content preview");
    await waitFor(() => {
      expect(iframe.getAttribute("srcdoc")).toContain(
        "img-src data: https://app.example.com;",
      );
    });
  });

  it("expands when an image increases the iframe document height after loading", async () => {
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

  it("measures the email document before its resources finish loading", async () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    const { getByTitle } = render(
      <HtmlEmail html="<p>Long email</p>" messageId="message-loading" />,
    );
    const iframe = getByTitle("Email content preview") as HTMLIFrameElement;
    let iframeDocument = iframe.contentDocument;
    const emailDocument = document.implementation.createHTMLDocument("email");

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

    await waitFor(() => expect(animationFrameCallbacks).not.toHaveLength(0));
    iframeDocument = emailDocument;
    act(() => animationFrameCallbacks.shift()?.(0));

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

    const iframe = getByTitle("Email content preview");
    await waitFor(() => {
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
