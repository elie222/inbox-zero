/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
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

describe("HtmlEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    vi.unstubAllGlobals();
  });

  it("requests fresh rewritten html after remounting the same email", async () => {
    const html = "<p>Hello</p>";

    const firstRender = render(<HtmlEmail html={html} />);
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });
    firstRender.unmount();

    render(<HtmlEmail html={html} />);
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2);
    });
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
      <HtmlEmail html={'<img src="https://cdn.example.com/photo.png" />'} />,
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
      <HtmlEmail html={'<img src="https://cdn.example.com/photo.png" />'} />,
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
