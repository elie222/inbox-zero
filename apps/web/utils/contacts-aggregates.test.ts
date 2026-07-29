import { describe, expect, it } from "vitest";
import {
  countPeopleByLabel,
  rollUpCompanyStats,
} from "@/utils/contacts-aggregates";
import type { ContactListItem, DomainStat } from "@/utils/contacts";

const domainStat = (overrides: Partial<DomainStat> = {}): DomainStat => ({
  domain: "toyota.com",
  people: 3,
  emails: 30,
  received: 20,
  sent: 10,
  lastInteractionAt: new Date("2026-07-01"),
  ...overrides,
});

const member = (overrides: Partial<ContactListItem> = {}): ContactListItem => ({
  contactId: null,
  email: "jane@toyota.com",
  domain: "toyota.com",
  name: "Jane Doe",
  title: null,
  phones: [],
  notes: null,
  aiSummary: null,
  photoUrl: null,
  useCompanyLogo: true,
  isPersonal: false,
  companyId: null,
  receivedCount: 4,
  sentCount: 1,
  lastInteractionAt: new Date("2026-06-01"),
  stale: false,
  isSaved: false,
  inboxPriority: "OFF",
  inboxPriorityInstructions: null,
  ...overrides,
});

describe("rollUpCompanyStats", () => {
  it("sums every domain the company owns", () => {
    const stats = rollUpCompanyStats({
      domains: ["toyota.com", "lexus.com"],
      domainStats: [
        domainStat(),
        domainStat({ domain: "lexus.com", people: 2, received: 5, sent: 3 }),
        // Not this company's — must be ignored
        domainStat({ domain: "ford.com", people: 9, received: 90, sent: 40 }),
      ],
      members: [],
    });

    expect(stats.people).toBe(5);
    expect(stats.received).toBe(25);
    expect(stats.sent).toBe(13);
    expect(stats.emails).toBe(38);
  });

  it("adds people assigned from a domain the company doesn't own", () => {
    const stats = rollUpCompanyStats({
      domains: ["toyota.com"],
      domainStats: [domainStat()],
      members: [
        member(),
        member({
          email: "mark@gmail.com",
          domain: "gmail.com",
          receivedCount: 7,
          sentCount: 2,
        }),
      ],
    });

    // 3 on-domain people from history, plus the one assigned from gmail.com
    expect(stats.people).toBe(4);
    expect(stats.received).toBe(27);
    expect(stats.sent).toBe(12);
  });

  it("never reports fewer people than the members it was given", () => {
    const stats = rollUpCompanyStats({
      domains: ["toyota.com"],
      domainStats: [domainStat({ people: 1 })],
      members: [member(), member({ email: "bob@toyota.com" })],
    });

    expect(stats.people).toBe(2);
  });

  it("takes the latest activity across domains and members", () => {
    const stats = rollUpCompanyStats({
      domains: ["toyota.com"],
      domainStats: [domainStat({ lastInteractionAt: new Date("2026-07-01") })],
      members: [member({ lastInteractionAt: new Date("2026-07-20") })],
    });

    expect(stats.lastInteractionAt).toEqual(new Date("2026-07-20"));
  });

  it("handles dates that came back from JSON as strings", () => {
    const stats = rollUpCompanyStats({
      domains: ["toyota.com"],
      domainStats: [
        domainStat({
          lastInteractionAt: "2026-07-05T00:00:00.000Z" as unknown as Date,
        }),
      ],
      members: [],
    });

    expect(stats.lastInteractionAt).toEqual(new Date("2026-07-05"));
  });

  it("reports no activity when nothing is known", () => {
    const stats = rollUpCompanyStats({
      domains: [],
      domainStats: [domainStat()],
      members: [],
    });

    expect(stats).toEqual({
      people: 0,
      received: 0,
      sent: 0,
      emails: 0,
      lastInteractionAt: null,
    });
  });
});

describe("countPeopleByLabel", () => {
  const oem = { id: "oem", name: "OEM", parent: null };
  const vendors = { id: "vendors", name: "Vendors", parent: null };
  const dms = { id: "dms", name: "DMS", parent: vendors };

  it("counts a label's people across its companies", () => {
    const counts = countPeopleByLabel([
      { label: oem, people: 14 },
      { label: oem, people: 11 },
      { label: null, people: 5 },
    ]);

    expect(counts.get("oem")).toBe(25);
    expect(counts.size).toBe(1);
  });

  it("rolls a child label's people into its parent", () => {
    const counts = countPeopleByLabel([
      { label: dms, people: 8 },
      { label: vendors, people: 4 },
    ]);

    expect(counts.get("dms")).toBe(8);
    expect(counts.get("vendors")).toBe(12);
  });
});
