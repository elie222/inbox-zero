import { describe, expect, it } from "vitest";
import {
  getLandingAlternates,
  localizeLandingHref,
  parseLandingPathname,
} from "@/utils/i18n/landing";

describe("localizeLandingHref", () => {
  it("prefixes translated landing pages with the locale", () => {
    expect(localizeLandingHref("/pricing", "es")).toBe("/es/pricing");
    expect(localizeLandingHref("/", "de")).toBe("/de");
    expect(localizeLandingHref("/pricing?plan=pro#faq", "fr")).toBe(
      "/fr/pricing?plan=pro#faq",
    );
  });

  it("keeps English, external links and untranslated pages as they are", () => {
    expect(localizeLandingHref("/pricing", "en")).toBe("/pricing");
    expect(localizeLandingHref("/login", "es")).toBe("/login");
    expect(localizeLandingHref("https://example.com", "es")).toBe(
      "https://example.com",
    );
    expect(localizeLandingHref("#faq", "es")).toBe("#faq");
  });
});

describe("parseLandingPathname", () => {
  it("splits the locale prefix from the path", () => {
    expect(parseLandingPathname("/pt-BR/pricing")).toEqual({
      locale: "pt-BR",
      path: "/pricing",
    });
    expect(parseLandingPathname("/es")).toEqual({ locale: "es", path: "/" });
    expect(parseLandingPathname("/l/es/pricing")).toEqual({
      locale: "es",
      path: "/pricing",
    });
    expect(parseLandingPathname("/pricing")).toEqual({
      locale: "en",
      path: "/pricing",
    });
  });
});

describe("getLandingAlternates", () => {
  it("lists every language and points the canonical at the current one", () => {
    expect(getLandingAlternates("/pricing", "es")).toEqual({
      canonical: "/es/pricing",
      languages: {
        "x-default": "/pricing",
        en: "/pricing",
        es: "/es/pricing",
        fr: "/fr/pricing",
        de: "/de/pricing",
        "pt-BR": "/pt-BR/pricing",
      },
    });
  });

  it("only sets a canonical for pages without translations", () => {
    expect(getLandingAlternates("/login", "en")).toEqual({
      canonical: "/login",
    });
  });
});
