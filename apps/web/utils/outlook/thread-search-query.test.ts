import { describe, expect, it } from "vitest";
import { buildOutlookThreadSearchQuery } from "@/utils/outlook/thread-search-query";

describe("buildOutlookThreadSearchQuery", () => {
  it.each([
    ["has the words", "quarterly invoice", '"quarterly invoice"'],
    ["from", "from:billing@example.com", '"from:billing@example.com"'],
    ["to", "to:team@example.com", '"to:team@example.com"'],
    ["subject", "subject:test", '"subject:test"'],
    [
      "multi-word subject",
      'subject:"weekly report"',
      '"subject:\\"weekly report\\""',
    ],
    ["doesn't have", "-newsletter", '"size>=0 NOT newsletter"'],
    ["size greater than", "larger:5M", '"size>5242880"'],
    ["size less than", "smaller:10K", '"size<10240"'],
    ["attachments", "has:attachment", '"hasattachments:true"'],
    [
      "date window",
      "after:2026/9/1 before:2026/9/3",
      '"received>=2026-09-01 received<2026-09-03"',
    ],
  ])("translates a %s query into Graph KQL", (_name, query, expected) => {
    expect(buildOutlookThreadSearchQuery(query)).toBe(expected);
  });

  it("combines several advanced-search fields", () => {
    expect(
      buildOutlookThreadSearchQuery(
        'from:alice@example.com subject:"Q3 plan" budget -draft larger:1M',
      ),
    ).toBe(
      '"from:alice@example.com subject:\\"Q3 plan\\" budget size>1048576 NOT draft"',
    );
  });

  it("drops operators Graph search cannot scope by", () => {
    expect(
      buildOutlookThreadSearchQuery("invoice in:inbox is:starred -in:chats"),
    ).toBe('"invoice"');
  });

  it("strips characters Graph search rejects", () => {
    expect(buildOutlookThreadSearchQuery('what? "say \\ hi"')).toBe(
      '"what \\"say \\\\ hi\\""',
    );
  });

  it("returns an empty query when nothing searchable remains", () => {
    expect(buildOutlookThreadSearchQuery("in:inbox")).toBe("");
    expect(buildOutlookThreadSearchQuery("   ")).toBe("");
  });
});
