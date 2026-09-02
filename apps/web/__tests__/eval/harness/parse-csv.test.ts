import { describe, expect, it } from "vitest";
import { parseCsv } from "@/__tests__/eval/harness/parse-csv";

describe("parseCsv", () => {
  it("keeps commas, escaped quotes, and newlines inside quoted fields", () => {
    const text = [
      "id,subject,body",
      'a,"Hello, world","Line one\nLine two"',
      'b,"She said ""hi""",plain',
      "",
    ].join("\n");

    expect(parseCsv(text)).toEqual([
      { id: "a", subject: "Hello, world", body: "Line one\nLine two" },
      { id: "b", subject: 'She said "hi"', body: "plain" },
    ]);
  });

  it("accepts CRLF line endings and a UTF-8 BOM", () => {
    const text = "\uFEFFid,value\r\n1,x\r\n2,\r\n";

    expect(parseCsv(text)).toEqual([
      { id: "1", value: "x" },
      { id: "2", value: "" },
    ]);
  });

  it("rejects rows whose field count does not match the header", () => {
    expect(() => parseCsv("id,value\n1,x,extra\n")).toThrow(/row 2/);
  });
});
