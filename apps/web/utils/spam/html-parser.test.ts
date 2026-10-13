import { describe, expect, it } from "vitest";
import fixtures from "./fixtures/html-parser.json";
import { parseHtml } from "./html-parser";

describe("compatible HTML scanner", () => {
  for (const fixture of fixtures)
    it(fixture.id, () => {
      const actual = parseHtml(fixture.html).map(([car, cdr]) => ({
        car,
        cdr: Array.isArray(cdr) ? { car: cdr[0], cdr: cdr[1] } : cdr,
      }));
      expect(actual).toEqual(fixture.expected);
    });
});
