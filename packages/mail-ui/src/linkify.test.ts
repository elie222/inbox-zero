import { describe, expect, it } from "vitest";
import { linkifyPlainText } from "./linkify";

describe("linkifyPlainText", () => {
  it("finds web and email links while preserving the surrounding text", () => {
    const text =
      "Visit service.new/account or https://staging.example.com/verify?token=value.\nEmail support@example.com.";

    const result = linkifyPlainText(text);

    expect(result).toEqual([
      { type: "text", text: "Visit " },
      {
        type: "link",
        text: "service.new/account",
        href: "http://service.new/account",
      },
      { type: "text", text: " or " },
      {
        type: "link",
        text: "https://staging.example.com/verify?token=value",
        href: "https://staging.example.com/verify?token=value",
      },
      { type: "text", text: ".\nEmail " },
      {
        type: "link",
        text: "support@example.com",
        href: "mailto:support@example.com",
      },
      { type: "text", text: "." },
    ]);
  });

  it("links bare domains and addresses on any TLD, but not bare file-like names", () => {
    const text =
      "See example.com, mail person@example.zip, or open report.final.";

    expect(linkifyPlainText(text)).toEqual([
      { type: "text", text: "See " },
      { type: "link", text: "example.com", href: "http://example.com/" },
      { type: "text", text: ", mail " },
      {
        type: "link",
        text: "person@example.zip",
        href: "mailto:person@example.zip",
      },
      { type: "text", text: ", or open report.final." },
    ]);
  });

  it("leaves unsupported protocols as plain text", () => {
    const text = "Files: ftp://example.com/file";

    expect(linkifyPlainText(text)).toEqual([{ type: "text", text }]);
  });
});
