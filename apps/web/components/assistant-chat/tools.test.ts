import { describe, expect, it } from "vitest";
import { htmlToText } from "./tools";

describe("htmlToText", () => {
  it("decodes HTML entities so email previews render real characters", () => {
    const html =
      "<p>Ol&aacute;, Bah,</p><p>Espero que esteja tudo bem com voc&ecirc;.</p><p>Abra&ccedil;os,<br>Bert</p>";

    expect(htmlToText(html)).toBe(
      "Olá, Bah,\n Espero que esteja tudo bem com você.\n Abraços,\nBert",
    );
  });

  it("collapses non-breaking spaces (decoded from &nbsp;) into regular spaces", () => {
    expect(htmlToText("<p>hello&nbsp;&nbsp;world</p>")).toBe("hello world");
  });

  it("decodes &amp; via he.decode rather than the previous manual replace", () => {
    expect(htmlToText("Tom &amp; Jerry")).toBe("Tom & Jerry");
  });
});
