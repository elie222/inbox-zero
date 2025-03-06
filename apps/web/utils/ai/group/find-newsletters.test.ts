import { describe, it, expect, vi } from "vitest";
import { isNewsletterSender } from "./find-newsletters";

vi.mock("server-only", () => ({}));

describe("isNewsletterSender", () => {
  it("should match known newsletter providers", () => {
    expect(isNewsletterSender("updates@substack.com")).toBe(true);
    expect(isNewsletterSender("writer@mail.beehiiv.com")).toBe(true);
    expect(isNewsletterSender("blog@ghost.io")).toBe(true);
  });

  it("should match when newsletter provider is part of longer email", () => {
    expect(isNewsletterSender("daily-digest@custom.substack.com")).toBe(true);
    expect(isNewsletterSender("weekly@something.mail.beehiiv.com")).toBe(true);
    expect(isNewsletterSender("updates@company.ghost.io")).toBe(true);
  });

  it("should match emails containing 'newsletter' keyword", () => {
    expect(isNewsletterSender("newsletter@company.com")).toBe(true);
    expect(isNewsletterSender("weekly-newsletter@domain.com")).toBe(true);
    expect(isNewsletterSender("my.newsletter.digest@service.net")).toBe(true);
  });

  it("should match 'newsletter' keyword case-insensitively", () => {
    expect(isNewsletterSender("NEWSLETTER@company.com")).toBe(true);
    expect(isNewsletterSender("Weekly-Newsletter@domain.com")).toBe(true);
    expect(isNewsletterSender("MyNewsletter@service.net")).toBe(true);
  });

  it("should not match unrelated email addresses", () => {
    expect(isNewsletterSender("contact@company.com")).toBe(false);
    expect(isNewsletterSender("support@business.com")).toBe(false);
    expect(isNewsletterSender("updates@domain.net")).toBe(false);
  });

  it("should not match when newsletter providers are part of local part only", () => {
    expect(isNewsletterSender("substack@company.com")).toBe(false);
    expect(isNewsletterSender("beehiiv@domain.net")).toBe(false);
    expect(isNewsletterSender("ghost@service.org")).toBe(false);
  });
});
