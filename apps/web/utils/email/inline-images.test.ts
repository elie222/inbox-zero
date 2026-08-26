/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import {
  getInlineImageContentIds,
  rewriteInlineImageSources,
} from "./inline-images";

describe("inline email images", () => {
  it("finds normalized Content-IDs referenced by image elements", () => {
    expect(
      getInlineImageContentIds(
        '<p><img src="cid:%3Cscreenshot%40inboxzero.local%3E"><a href="cid:ignore-me">Link</a></p>',
      ),
    ).toEqual(["screenshot@inboxzero.local"]);
  });

  it("replaces matching cid image sources without changing unknown references", () => {
    const html =
      '<p><img alt="Screenshot" src="cid:screenshot@inboxzero.local"><img src="cid:unknown@example.com"></p>';

    const rewritten = rewriteInlineImageSources(html, {
      "screenshot@inboxzero.local": "blob:https://app.example.com/image-1",
    });

    expect(rewritten).toContain('src="blob:https://app.example.com/image-1"');
    expect(rewritten).toContain('src="cid:unknown@example.com"');
  });
});
