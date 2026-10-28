import { describe, expect, it } from "vitest";
import {
  buildOutlookSearchQuery,
  EMPTY_OUTLOOK_SEARCH_FIELDS,
  parseOutlookSearchQuery,
  type OutlookSearchFields,
} from "./outlook-search-query";

describe("buildOutlookSearchQuery", () => {
  it("returns an empty string when nothing is filled in", () => {
    expect(buildOutlookSearchQuery(EMPTY_OUTLOOK_SEARCH_FIELDS)).toBe("");
  });

  it("composes Outlook operators from the advanced search fields", () => {
    expect(
      buildOutlookSearchQuery(
        fields({
          from: "alice@example.com",
          to: "bob@example.com",
          subject: "weekly report",
          keywords: "invoice overdue",
          doesntHave: "unsubscribe",
          hasAttachment: true,
          searchIn: "inbox",
        }),
      ),
    ).toBe(
      'from:alice@example.com to:bob@example.com subject:"weekly report" invoice overdue NOT unsubscribe hasattachments:true in:inbox',
    );
  });

  it("encodes size and received dates as Outlook restrictions", () => {
    expect(
      buildOutlookSearchQuery(
        fields({ sizeComparison: "greater", sizeValue: "5", sizeUnit: "MB" }),
      ),
    ).toBe("size>5MB");
    expect(
      buildOutlookSearchQuery(fields({ dateWithin: "1d", date: "2024-03-15" })),
    ).toBe("received>=2024-03-14 received<2024-03-16");
  });

  it("searches a folder, category, or flagged mail with Outlook operators", () => {
    expect(
      buildOutlookSearchQuery(fields({ searchIn: "folder:Projects" })),
    ).toBe("folder:Projects");
    expect(buildOutlookSearchQuery(fields({ searchIn: "category:Work" }))).toBe(
      "category:Work",
    );
    expect(buildOutlookSearchQuery(fields({ searchIn: "flagged" }))).toBe(
      "is:flagged",
    );
    expect(buildOutlookSearchQuery(fields({ searchIn: "junk" }))).toBe(
      "in:junk",
    );
  });
});

describe("parseOutlookSearchQuery", () => {
  it("reads Outlook operators back into the form", () => {
    expect(
      parseOutlookSearchQuery(
        'from:alice@example.com subject:"weekly report" invoice NOT unsubscribe hasattachments:true in:inbox',
      ),
    ).toEqual(
      fields({
        from: "alice@example.com",
        subject: "weekly report",
        keywords: "invoice",
        doesntHave: "unsubscribe",
        hasAttachment: true,
        searchIn: "inbox",
      }),
    );
  });

  it("round-trips the fields the form can edit", () => {
    const original = fields({
      from: "Alice Smith",
      to: "team@example.com",
      subject: "Q1 plan",
      keywords: "budget",
      doesntHave: "ooo draft",
      sizeComparison: "less",
      sizeValue: "2",
      sizeUnit: "MB",
      dateWithin: "3d",
      date: "2024-07-10",
      searchIn: "sent",
      hasAttachment: true,
    });

    expect(parseOutlookSearchQuery(buildOutlookSearchQuery(original))).toEqual(
      original,
    );
  });

  it("keeps unknown Outlook restrictions in Keywords", () => {
    expect(parseOutlookSearchQuery("importance:high filename:pdf")).toEqual(
      fields({ keywords: "importance:high filename:pdf" }),
    );
  });
});

function fields(overrides: Partial<OutlookSearchFields>): OutlookSearchFields {
  return { ...EMPTY_OUTLOOK_SEARCH_FIELDS, ...overrides };
}
