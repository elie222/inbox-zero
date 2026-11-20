import { describe, expect, it } from "vitest";
import { parseClientVersionHeader } from "./client-version";

describe("parseClientVersionHeader", () => {
  it("keeps a client/version value", () => {
    expect(parseClientVersionHeader("desktop/0.1.29")).toBe("desktop/0.1.29");
    expect(parseClientVersionHeader("desktop/1.0.0-beta.2+build_7")).toBe(
      "desktop/1.0.0-beta.2+build_7",
    );
  });

  it("is absent when the header is missing or has nothing usable", () => {
    expect(parseClientVersionHeader(null)).toBeUndefined();
    expect(parseClientVersionHeader("")).toBeUndefined();
    expect(parseClientVersionHeader(" <>\"';{}")).toBeUndefined();
  });

  it("strips characters that could forge or break log fields", () => {
    expect(
      parseClientVersionHeader('desktop/0.1.29\n{"level":"error"} <script>'),
    ).toBe("desktop/0.1.29levelerrorscript");
  });

  it("caps the length", () => {
    expect(parseClientVersionHeader(`desktop/${"9".repeat(500)}`)).toHaveLength(
      64,
    );
  });
});
