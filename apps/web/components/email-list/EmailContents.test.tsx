/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light" }),
}));

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_IMAGE_PROXY_BASE_URL: "https://img.example.com/proxy",
  },
}));

import { HtmlEmail } from "./EmailContents";

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
});
