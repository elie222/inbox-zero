import { describe, expect, it } from "vitest";
import { htmlToSearchText, searchMatchQuery } from "./search-text";

describe("htmlToSearchText", () => {
  it("keeps visible text and drops markup, styles, scripts, head, and comments", () => {
    const html = `<!DOCTYPE html><html><head><title>Hidden title</title>
      <style type="text/css">.font-large { font-family: Arial }</style></head>
      <body><!--[if mso]><table><tr><td><![endif]-->
      <table style="font-size:14px"><tr><td class="column">Quarterly <b>report</b></td>
      <td><a href="https://click.example.com/track?utm_source=news">Read more</a></td></tr></table>
      <script>var tracking = "pixel";</script>
      <img src="https://img.example.com/pixel.gif" alt=""></body></html>`;

    expect(htmlToSearchText(html)).toBe("Quarterly report Read more");
  });

  it("joins inline tags inside a word and separates block tags", () => {
    expect(htmlToSearchText("<p>in<b>voice</b></p><p>total</p>")).toBe(
      "invoice total",
    );
    expect(htmlToSearchText("line one<br>line two<div>three</div>")).toBe(
      "line one line two three",
    );
  });

  it("decodes named, accented, and numeric entities", () => {
    expect(
      htmlToSearchText(
        "Caf&eacute; &amp; cr&egrave;me&nbsp;br&ucirc;l&eacute;e &#8212; &#x41;BC &lt;tag&gt; &unknown; &copy",
      ),
    ).toBe("Café & crème brûlée — ABC <tag> &unknown; ©");
  });

  it("ignores angle brackets inside quoted attributes", () => {
    expect(htmlToSearchText('<a title="a > b">Link</a> text')).toBe(
      "Link text",
    );
  });

  it("leaves a stray less-than sign as text", () => {
    expect(htmlToSearchText("<p>1 < 2 and 3 > 2</p>")).toBe("1 < 2 and 3 > 2");
  });
});

describe("searchMatchQuery", () => {
  it("ANDs each term as a quoted prefix token", () => {
    expect(searchMatchQuery("quarterly inv", "term")).toBe(
      '"quarterly"* "inv"*',
    );
  });

  it("keeps a phrase together with a prefix on its last word", () => {
    expect(searchMatchQuery("quarterly inv", "phrase")).toBe(
      '"quarterly inv"*',
    );
  });

  it("neutralizes quotes, operators, and column filters", () => {
    expect(searchMatchQuery('subject:"x" OR NEAR(a) -b ^c', "term")).toBe(
      '"subject:""x"""* "OR"* "NEAR(a)"* "-b"* "^c"*',
    );
  });

  it("matches a single character as a whole word", () => {
    expect(searchMatchQuery("a invoice", "term")).toBe('"a" "invoice"*');
  });

  it("splits scripts written without spaces into a character phrase", () => {
    expect(searchMatchQuery("請求書 invoice", "term")).toBe(
      '"請 求 書"* "invoice"*',
    );
  });

  it("drops terms with nothing to search for", () => {
    expect(searchMatchQuery("... invoice ---", "term")).toBe('"invoice"*');
    expect(searchMatchQuery("... ---", "term")).toBeNull();
    expect(searchMatchQuery('"*"', "phrase")).toBeNull();
  });
});
