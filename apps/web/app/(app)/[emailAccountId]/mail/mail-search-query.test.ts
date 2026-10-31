import { describe, expect, it } from "vitest";
import {
  buildMailSearchQuery,
  EMPTY_MAIL_SEARCH_FIELDS,
  parseMailSearchQuery,
  toCommonMailSearchFields,
  type MailSearchFields,
} from "./mail-search-query";

describe("buildMailSearchQuery", () => {
  it("returns an empty string when nothing is filled in", () => {
    expect(buildMailSearchQuery(EMPTY_MAIL_SEARCH_FIELDS)).toBe("");
  });

  it("composes Gmail operators from the advanced search fields", () => {
    expect(
      buildMailSearchQuery(
        fields({
          from: "alice@example.com",
          to: "bob@example.com",
          subject: "weekly report",
          hasWords: "invoice overdue",
          doesntHave: "unsubscribe",
          hasAttachment: true,
          excludeChats: true,
          searchIn: "inbox",
        }),
      ),
    ).toBe(
      'from:alice@example.com to:bob@example.com subject:"weekly report" invoice overdue -unsubscribe has:attachment in:inbox -in:chats',
    );
  });

  it("quotes values that contain spaces and excludes each missing word", () => {
    expect(
      buildMailSearchQuery(
        fields({
          from: "Alice Smith",
          doesntHave: "foo bar",
        }),
      ),
    ).toBe('from:"Alice Smith" -foo -bar');
  });

  it("encodes size as Gmail larger/smaller operators", () => {
    expect(
      buildMailSearchQuery(
        fields({ sizeComparison: "greater", sizeValue: "5", sizeUnit: "MB" }),
      ),
    ).toBe("larger:5M");
    expect(
      buildMailSearchQuery(
        fields({ sizeComparison: "less", sizeValue: "100", sizeUnit: "KB" }),
      ),
    ).toBe("smaller:100K");
  });

  it("ignores size when the amount is missing or not positive", () => {
    expect(buildMailSearchQuery(fields({ sizeValue: "" }))).toBe("");
    expect(buildMailSearchQuery(fields({ sizeValue: "0" }))).toBe("");
  });

  it("builds a date window around the chosen day", () => {
    expect(
      buildMailSearchQuery(fields({ dateWithin: "1d", date: "2024-03-15" })),
    ).toBe("after:2024/3/14 before:2024/3/16");
    expect(
      buildMailSearchQuery(fields({ dateWithin: "1m", date: "2024-03-15" })),
    ).toBe("after:2024/2/14 before:2024/4/14");
  });

  it("ignores a date window when no date is chosen", () => {
    expect(buildMailSearchQuery(fields({ dateWithin: "1w" }))).toBe("");
  });

  it("searches a user label with the label operator", () => {
    expect(
      buildMailSearchQuery(fields({ searchIn: "label:Work Projects" })),
    ).toBe('label:"Work Projects"');
  });
});

describe("parseMailSearchQuery", () => {
  it("treats free text as Has the words", () => {
    expect(parseMailSearchQuery("invoice overdue")).toEqual(
      fields({ hasWords: "invoice overdue" }),
    );
  });

  it("reads Gmail operators back into the form", () => {
    expect(
      parseMailSearchQuery(
        'from:alice@example.com to:bob@example.com subject:"weekly report" invoice overdue -unsubscribe has:attachment in:inbox -in:chats',
      ),
    ).toEqual(
      fields({
        from: "alice@example.com",
        to: "bob@example.com",
        subject: "weekly report",
        hasWords: "invoice overdue",
        doesntHave: "unsubscribe",
        hasAttachment: true,
        excludeChats: true,
        searchIn: "inbox",
      }),
    );
  });

  it("keeps unknown operators in Has the words so typed queries are not destroyed", () => {
    expect(parseMailSearchQuery("is:unread filename:pdf")).toEqual(
      fields({ hasWords: "is:unread filename:pdf" }),
    );
  });

  it("round-trips the fields the form can edit", () => {
    const original = fields({
      from: "Alice Smith",
      to: "team@example.com",
      subject: "Q1 plan",
      hasWords: "budget",
      doesntHave: "ooo draft",
      sizeComparison: "less",
      sizeValue: "2",
      sizeUnit: "MB",
      dateWithin: "3d",
      date: "2024-07-10",
      searchIn: "sent",
      hasAttachment: true,
      excludeChats: true,
    });

    expect(parseMailSearchQuery(buildMailSearchQuery(original))).toEqual(
      original,
    );
  });

  it("keeps negated operators the form cannot edit in Has the words", () => {
    expect(parseMailSearchQuery("-from:alice@example.com")).toEqual(
      fields({ hasWords: "-from:alice@example.com" }),
    );
    expect(parseMailSearchQuery('-"weekly report"')).toEqual(
      fields({ hasWords: '-"weekly report"' }),
    );
    expect(parseMailSearchQuery("-unsubscribe -in:chats")).toEqual(
      fields({ doesntHave: "unsubscribe", excludeChats: true }),
    );
  });

  it("only fills Date within when after/before match a supported window", () => {
    expect(parseMailSearchQuery("after:2024/3/14 before:2024/3/16")).toEqual(
      fields({ dateWithin: "1d", date: "2024-03-15" }),
    );
    expect(parseMailSearchQuery("after:2024/1/1 before:2024/1/10")).toEqual(
      fields({ hasWords: "after:2024/1/1 before:2024/1/10" }),
    );
  });

  it("only fills Size when larger/smaller includes a unit suffix", () => {
    expect(parseMailSearchQuery("larger:1000M")).toEqual(
      fields({ sizeComparison: "greater", sizeValue: "1000", sizeUnit: "MB" }),
    );
    expect(parseMailSearchQuery("larger:1000")).toEqual(
      fields({ hasWords: "larger:1000" }),
    );
  });
});

describe("toCommonMailSearchFields", () => {
  it("keeps shared operators including Doesn't have and drops Gmail-only fields", () => {
    const projected = toCommonMailSearchFields(
      fields({
        from: "alice@example.com",
        to: "bob@example.com",
        subject: "weekly report",
        hasWords: "invoice",
        doesntHave: "unsubscribe",
        sizeComparison: "less",
        sizeValue: "5",
        sizeUnit: "KB",
        dateWithin: "1w",
        date: "2024-03-15",
        searchIn: "inbox",
        hasAttachment: true,
        excludeChats: true,
      }),
    );

    expect(projected).toEqual(
      fields({
        from: "alice@example.com",
        to: "bob@example.com",
        subject: "weekly report",
        hasWords: "invoice",
        doesntHave: "unsubscribe",
      }),
    );
    expect(buildMailSearchQuery(projected)).toBe(
      'from:alice@example.com to:bob@example.com subject:"weekly report" invoice -unsubscribe',
    );
  });
});

function fields(overrides: Partial<MailSearchFields>): MailSearchFields {
  return { ...EMPTY_MAIL_SEARCH_FIELDS, ...overrides };
}
