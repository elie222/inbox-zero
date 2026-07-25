import { describe, expect, it } from "vitest";
import {
  contactAvatarUrl,
  groupContacts,
  isLikelyAutomatedSender,
  mergeContactActivity,
  pendingDomainStats,
  resolveContactCompany,
  type CompanySummary,
  type ContactListItem,
  type SavedContact,
} from "@/utils/contacts";

const NOW = new Date("2026-07-24");

const activity = (overrides = {}) => ({
  email: "jane@example.com",
  name: "Jane Doe",
  receivedCount: 5,
  sentCount: 2,
  lastInteractionAt: new Date("2026-07-01"),
  ...overrides,
});

const saved = (overrides: Partial<SavedContact> = {}): SavedContact => ({
  email: "jane@example.com",
  name: null,
  title: null,
  phone: null,
  notes: null,
  aiSummary: null,
  photoUrl: null,
  useCompanyLogo: true,
  isPersonal: false,
  companyId: null,
  ...overrides,
});

const company = (overrides: Partial<CompanySummary> = {}): CompanySummary => ({
  id: "co-1",
  name: "Example Corp",
  domains: ["example.com"],
  logoUrl: null,
  logoWhiteBackground: false,
  label: null,
  ...overrides,
});

const item = (overrides: Partial<ContactListItem> = {}): ContactListItem => ({
  email: "jane@example.com",
  domain: "example.com",
  name: "Jane Doe",
  title: null,
  phone: null,
  notes: null,
  aiSummary: null,
  photoUrl: null,
  useCompanyLogo: true,
  isPersonal: false,
  companyId: null,
  receivedCount: 5,
  sentCount: 2,
  lastInteractionAt: new Date("2026-07-01"),
  stale: false,
  isSaved: false,
  ...overrides,
});

describe("mergeContactActivity", () => {
  it("returns activity entries as unsaved contacts with derived domain", () => {
    const result = mergeContactActivity({
      activity: [activity()],
      saved: [],
      now: NOW,
    });

    expect(result[0]).toMatchObject({
      email: "jane@example.com",
      domain: "example.com",
      name: "Jane Doe",
      isSaved: false,
      stale: false,
    });
  });

  it("strips www. from the derived domain so it matches normalized company domains", () => {
    const result = mergeContactActivity({
      activity: [activity({ email: "bot@www.example.com" })],
      saved: [],
      now: NOW,
    });

    expect(result[0].domain).toBe("example.com");
  });

  it("saved details override derived ones, matching case-insensitively", () => {
    const result = mergeContactActivity({
      activity: [activity()],
      saved: [
        saved({ email: "Jane@Example.com", name: "Jane D.", title: "CTO" }),
      ],
      now: NOW,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "Jane D.",
      title: "CTO",
      isSaved: true,
      receivedCount: 5,
    });
  });

  it("appends manually added contacts that have no email activity", () => {
    const result = mergeContactActivity({
      activity: [],
      saved: [saved({ email: "New@Person.com", name: "New Person" })],
      now: NOW,
    });

    expect(result[0]).toMatchObject({
      email: "new@person.com",
      receivedCount: 0,
      lastInteractionAt: null,
      stale: false,
    });
  });

  it("flags contacts with no interaction in 90 days as stale", () => {
    const result = mergeContactActivity({
      activity: [
        activity({ lastInteractionAt: new Date("2026-01-01") }),
        activity({ email: "fresh@example.com", lastInteractionAt: NOW }),
      ],
      saved: [],
      now: NOW,
    });

    expect(result[0].stale).toBe(true);
    expect(result[1].stale).toBe(false);
  });
});

describe("resolveContactCompany", () => {
  it("matches a company through its domains", () => {
    expect(resolveContactCompany(item(), [company()])?.id).toBe("co-1");
    expect(
      resolveContactCompany(item({ domain: "elsewhere.com" }), [company()]),
    ).toBe(null);
  });

  it("explicit companyId wins over domain matching", () => {
    const other = company({ id: "co-2", name: "Other", domains: [] });
    expect(
      resolveContactCompany(item({ companyId: "co-2" }), [company(), other])
        ?.id,
    ).toBe("co-2");
  });

  it("never groups personal contacts or public email domains", () => {
    expect(resolveContactCompany(item({ isPersonal: true }), [company()])).toBe(
      null,
    );
    expect(
      resolveContactCompany(
        item({ email: "j@gmail.com", domain: "gmail.com" }),
        [company({ domains: ["gmail.com"] })],
      ),
    ).toBe(null);
  });
});

describe("groupContacts", () => {
  it("groups by company, auto-domain, personal, and other", () => {
    const groups = groupContacts({
      contacts: [
        item(), // domain match → Example Corp
        item({ email: "a@toyota.com", domain: "toyota.com" }), // auto group
        item({ email: "b@toyota.com", domain: "toyota.com" }),
        item({ email: "mom@gmail.com", domain: "gmail.com", isPersonal: true }),
        item({ email: "x@yahoo.com", domain: "yahoo.com" }), // public → Other
      ],
      companies: [company()],
    });

    const byKey = Object.fromEntries(groups.map((g) => [g.key, g]));
    expect(byKey["co-1"].contacts).toHaveLength(1);
    expect(byKey["domain:toyota.com"].contacts).toHaveLength(2);
    expect(byKey.personal.contacts).toHaveLength(1);
    expect(byKey.other.contacts).toHaveLength(1);
  });

  it("a company with several domains claims contacts from all of them", () => {
    const toyota = company({
      id: "co-t",
      name: "Toyota",
      domains: ["toyota.com", "lexus.com"],
    });
    const groups = groupContacts({
      contacts: [
        item({ email: "a@toyota.com", domain: "toyota.com" }),
        item({ email: "b@lexus.com", domain: "lexus.com" }),
      ],
      companies: [toyota],
    });

    expect(groups[0]).toMatchObject({ key: "co-t", name: "Toyota" });
    expect(groups[0].contacts).toHaveLength(2);
  });

  it("shows companies that have no members yet", () => {
    const groups = groupContacts({ contacts: [], companies: [company()] });
    expect(groups[0].key).toBe("co-1");
  });

  it("orders companies A→Z regardless of member count, specials pinned", () => {
    const zebra = company({
      id: "co-z",
      name: "Zebra",
      domains: ["zebra.com"],
    });
    const apple = company({
      id: "co-a",
      name: "apple",
      domains: ["apple.com"],
    });
    const mango = company({
      id: "co-m",
      name: "Mango",
      domains: ["mango.com"],
    });
    const groups = groupContacts({
      contacts: [
        // Zebra has the most members — must still sort last among companies
        item({ email: "a@zebra.com", domain: "zebra.com" }),
        item({ email: "b@zebra.com", domain: "zebra.com" }),
        item({ email: "c@mango.com", domain: "mango.com" }),
        item({ email: "mom@gmail.com", domain: "gmail.com", isPersonal: true }),
      ],
      companies: [zebra, apple, mango],
    });

    expect(groups.map((group) => group.key)).toEqual([
      "personal",
      "co-a",
      "co-m",
      "co-z",
    ]);
  });
});

describe("contactAvatarUrl", () => {
  it("defaults to the company logo", () => {
    expect(
      contactAvatarUrl(item({ photoUrl: "https://p.example/me.jpg" }), [
        company({ logoUrl: "https://logo.example/corp.png" }),
      ]),
    ).toBe("https://logo.example/corp.png");
  });

  it("falls back to the domain favicon when the company has no logo", () => {
    expect(contactAvatarUrl(item(), [company()])).toContain("example.com");
  });

  it("uses the personal photo when the contact opted out of the logo", () => {
    expect(
      contactAvatarUrl(
        item({ photoUrl: "https://p.example/me.jpg", useCompanyLogo: false }),
        [company({ logoUrl: "https://logo.example/corp.png" })],
      ),
    ).toBe("https://p.example/me.jpg");
  });
});

describe("isLikelyAutomatedSender", () => {
  it.each([
    "noreply@vercel.com",
    "no-reply@github.com",
    "no.reply@shop.com",
    "do-not-reply@bank.com",
    "donotreply@insurer.com",
    "invoice+statements@supplier.com",
    "notifications@vercel.com",
    "alerts@datadog.com",
    "mailer-daemon@googlemail.com",
    "billing@stripe.com",
    "team@costalerts.amazonaws.com",
    "info@mailer.linkedin.com",
  ])("flags %s as automated", (email) => {
    expect(isLikelyAutomatedSender(email)).toBe(true);
  });

  it.each([
    "jane@example.com",
    "leah@northstar.vc",
    "chris@nucar.com",
    "anna.newsletter-jones@agency.com",
    "sales@toyota.co.uk",
  ])("keeps %s as a real person", (email) => {
    expect(isLikelyAutomatedSender(email)).toBe(false);
  });
});

describe("pendingDomainStats", () => {
  const stat = (domain: string, emails: number) => ({
    domain,
    people: 1,
    emails,
    received: emails,
    sent: 0,
    lastInteractionAt: null,
  });

  it("drops company-claimed and ignored domains, keeping order", () => {
    const result = pendingDomainStats(
      [stat("big.com", 90), stat("example.com", 50), stat("tiny.io", 2)],
      [company()],
      ["tiny.io"],
    );
    expect(result.map((s) => s.domain)).toEqual(["big.com"]);
  });
});
