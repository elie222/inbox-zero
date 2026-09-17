import { describe, expect, it } from "vitest";
import {
  compileOutlookThreadSearch,
  isEmptyOutlookSearch,
} from "@/utils/outlook/thread-search-query";

describe("compileOutlookThreadSearch", () => {
  it.each([
    ["keywords", "quarterly invoice", '"quarterly invoice"'],
    ["from", "from:billing@example.com", '"from:billing@example.com"'],
    ["to", "to:team@example.com", '"to:team@example.com"'],
    ["subject", "subject:test", '"subject:test"'],
    [
      "multi-word subject",
      'subject:"weekly report"',
      '"subject:\\"weekly report\\""',
    ],
    ["doesn't have", "NOT newsletter", '"size>=0 NOT newsletter"'],
    ["size greater than", "size>5MB", '"size>5242880"'],
    ["size less than", "size<10KB", '"size<10240"'],
    ["attachments", "hasattachments:true", '"hasattachments:true"'],
    [
      "received window",
      "received>=2026-09-01 received<2026-09-03",
      '"received>=2026-09-01 received<2026-09-03"',
    ],
  ])("compiles a %s query into Graph KQL", (_name, query, expected) => {
    expect(compileOutlookThreadSearch(query).search).toBe(expected);
  });

  it("combines several Outlook fields and keeps folder/flag out of KQL", () => {
    expect(
      compileOutlookThreadSearch(
        'from:alice@example.com subject:"Q3 plan" budget NOT draft size>1MB in:inbox is:flagged',
      ),
    ).toEqual({
      search:
        '"from:alice@example.com subject:\\"Q3 plan\\" budget size>1048576 NOT draft"',
      folderKey: "inbox",
      folderName: undefined,
      flagged: true,
      category: undefined,
    });
  });

  it("scopes junk, deleted, and custom folders instead of dropping them", () => {
    expect(compileOutlookThreadSearch("invoice in:junk")).toEqual({
      search: '"invoice"',
      folderKey: "junkemail",
      folderName: undefined,
      flagged: false,
      category: undefined,
    });
    expect(compileOutlookThreadSearch('invoice folder:"Projects"')).toEqual({
      search: '"invoice"',
      folderKey: undefined,
      folderName: "Projects",
      flagged: false,
      category: undefined,
    });
  });

  it("keeps a quoted operator-like phrase as literal text", () => {
    expect(compileOutlookThreadSearch('"from:alice@example.com"').search).toBe(
      '"\\"from:alice@example.com\\""',
    );
  });

  it.each([
    ["an impossible day", "received>=2026-02-30"],
    ["an impossible month", "received<2026-13-01"],
    ["an oversized number", `size>${"9".repeat(400)}`],
  ])("drops a restriction with %s", (_name, query) => {
    expect(compileOutlookThreadSearch(`invoice ${query}`).search).toBe(
      '"invoice"',
    );
  });

  it("returns an empty compiled search when nothing searchable remains", () => {
    expect(isEmptyOutlookSearch(compileOutlookThreadSearch("   "))).toBe(true);
    expect(compileOutlookThreadSearch("in:inbox")).toEqual({
      search: "",
      folderKey: "inbox",
      folderName: undefined,
      flagged: false,
      category: undefined,
    });
  });
});
