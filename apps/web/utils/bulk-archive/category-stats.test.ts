import { describe, expect, it } from "vitest";
import {
  getReadRate,
  orderByReadRate,
  sumCategoryStats,
} from "@/utils/bulk-archive/category-stats";

function category(
  name: string,
  senders: number,
  inbox: number,
  unread: number,
  read: number,
  total: number,
) {
  return { name, stats: { senders, inbox, unread, read, total } };
}

describe("sumCategoryStats", () => {
  it("adds every sender's counts and counts the senders", () => {
    expect(
      sumCategoryStats([
        { inbox: 3, unread: 1, read: 5, total: 8 },
        { inbox: 2, unread: 2, read: 0, total: 2 },
      ]),
    ).toEqual({ senders: 2, inbox: 5, unread: 3, read: 5, total: 10 });
  });

  it("returns zeros for a category with no senders", () => {
    expect(sumCategoryStats([])).toEqual({
      senders: 0,
      inbox: 0,
      unread: 0,
      read: 0,
      total: 0,
    });
  });
});

describe("getReadRate", () => {
  it("is read over all stored mail, whatever is still in the inbox", () => {
    expect(getReadRate({ inbox: 0, unread: 0, read: 37, total: 100 })).toBe(
      0.37,
    );
  });

  it("is undefined when no mail is stored", () => {
    expect(
      getReadRate({ inbox: 0, unread: 0, read: 0, total: 0 }),
    ).toBeUndefined();
  });
});

describe("orderByReadRate", () => {
  const categories = [
    category("Other", 172, 6, 6, 980, 1000),
    category("Receipt", 21, 4, 4, 86, 100),
    category("Marketing", 78, 111, 44, 37, 100),
    category("Newsletter", 33, 26, 26, 76, 100),
    category("Notification", 189, 18, 18, 86, 100),
  ];

  it("sorts rarely read categories first and breaks ties by name", () => {
    const { ordered } = orderByReadRate(categories);
    expect(ordered.map(({ name }) => name)).toEqual([
      "Marketing",
      "Newsletter",
      "Notification",
      "Receipt",
      "Other",
    ]);
  });

  it("leads with the single lowest read rate", () => {
    expect(orderByReadRate(categories).leadName).toBe("Marketing");
  });

  it("keeps the same order and lead after the lead is archived", () => {
    const archived = categories.map((item) =>
      item.name === "Marketing"
        ? { ...item, stats: { ...item.stats, inbox: 0, unread: 0 } }
        : item,
    );
    const { ordered, leadName } = orderByReadRate(archived);
    expect(ordered[0].name).toBe("Marketing");
    expect(leadName).toBe("Marketing");
  });

  it("puts categories with no stored mail last and never leads with them", () => {
    const { ordered, leadName } = orderByReadRate([
      category("Receipt", 0, 0, 0, 0, 0),
      category("Other", 4, 1, 1, 90, 100),
    ]);
    expect(ordered.map(({ name }) => name)).toEqual(["Other", "Receipt"]);
    expect(leadName).toBe("Other");
  });

  it("has no lead when nothing has senders", () => {
    expect(
      orderByReadRate([category("Other", 0, 0, 0, 0, 0)]).leadName,
    ).toBeUndefined();
  });
});
