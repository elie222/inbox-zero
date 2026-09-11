import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChartStyle } from "./chart";

describe("ChartStyle", () => {
  it("does not allow chart config keys to escape the style element", () => {
    const hostileKey = "rule</style><script>alert('xss')</script><style>";

    const html = renderToStaticMarkup(
      createElement(ChartStyle, {
        id: "rule-stats",
        config: { [hostileKey]: { color: "red" } },
      }),
    );

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("</style><script>");
  });
});
