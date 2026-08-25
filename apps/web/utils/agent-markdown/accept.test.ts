import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendVaryAccept,
  parseAcceptHeader,
  preferredType,
  prefersMarkdown,
} from "./accept";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("parseAcceptHeader", () => {
  it("returns an empty list for missing headers", () => {
    expect(parseAcceptHeader(null)).toEqual([]);
    expect(parseAcceptHeader("")).toEqual([]);
  });

  it("parses q-values and positions", () => {
    expect(
      parseAcceptHeader("text/markdown, text/html;q=0.8, */*;q=0.1"),
    ).toEqual([
      { type: "text/markdown", q: 1, position: 0 },
      { type: "text/html", q: 0.8, position: 1 },
      { type: "*/*", q: 0.1, position: 2 },
    ]);
  });

  it("parses parameter names case-insensitively", () => {
    expect(parseAcceptHeader("text/markdown;Q=0.4")).toEqual([
      { type: "text/markdown", q: 0.4, position: 0 },
    ]);
  });
});

describe("preferredType", () => {
  it("defaults to HTML when Accept is missing", () => {
    expect(preferredType(null)).toBe("text/html");
  });

  it("selects markdown when it is most preferred", () => {
    expect(preferredType("text/markdown")).toBe("text/markdown");
    expect(preferredType("text/markdown, text/html")).toBe("text/markdown");
    expect(preferredType("text/html;q=0.5, text/markdown")).toBe(
      "text/markdown",
    );
  });

  it("keeps HTML for typical browser Accept values", () => {
    expect(
      preferredType(
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      ),
    ).toBe("text/html");
  });

  it("returns null when every produced type is rejected", () => {
    expect(preferredType("text/html;q=0, text/markdown;q=0")).toBeNull();
    expect(preferredType("application/json")).toBeNull();
  });
});

describe("prefersMarkdown", () => {
  it("is true only when markdown wins negotiation", () => {
    expect(prefersMarkdown("text/markdown")).toBe(true);
    expect(prefersMarkdown("text/html")).toBe(false);
    expect(prefersMarkdown(null)).toBe(false);
  });
});

describe("appendVaryAccept", () => {
  it("sets Vary when missing", () => {
    const headers = new Headers();
    appendVaryAccept(headers);
    expect(headers.get("vary")).toBe("Accept");
  });

  it("appends Accept without replacing existing tokens", () => {
    const headers = new Headers({
      Vary: "rsc, next-router-state-tree, next-router-prefetch",
    });
    appendVaryAccept(headers);
    expect(headers.get("vary")).toBe(
      "rsc, next-router-state-tree, next-router-prefetch, Accept",
    );
  });

  it("does not duplicate Accept", () => {
    const headers = new Headers({ Vary: "Accept, Accept-Encoding" });
    appendVaryAccept(headers);
    expect(headers.get("vary")).toBe("Accept, Accept-Encoding");
  });

  it("preserves a wildcard Vary value", () => {
    const headers = new Headers({ Vary: "*" });
    appendVaryAccept(headers);
    expect(headers.get("vary")).toBe("*");
  });
});
