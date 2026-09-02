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

  it("treats a lone CR as a line terminator", () => {
    expect(parseCsv("id,value\r1,x\r2,y")).toEqual([
      { id: "1", value: "x" },
      { id: "2", value: "y" },
    ]);
    expect(parseCsv("id,value\r1,x\r")).toEqual([{ id: "1", value: "x" }]);
  });

  it("skips blank lines but not single-field rows", () => {
    expect(parseCsv("id,value\n\n1,x\n\n")).toEqual([{ id: "1", value: "x" }]);
    expect(() => parseCsv('id,value\n1,x\n""\n')).toThrow(/row 3/);
  });

  it("rejects rows whose field count does not match the header", () => {
    expect(() => parseCsv("id,value\n1,x,extra\n")).toThrow(/row 2/);
  });

  it("rejects input that ends inside a quoted field", () => {
    expect(() => parseCsv('id,value\n1,"open')).toThrow(/quoted field/);
  });
});
