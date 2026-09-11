import { describe, expect, it } from "vitest";
import {
  getBookingLinkSlugSuggestion,
  normalizeBookingSlug,
} from "@/utils/booking/slug";

describe("booking slug helpers", () => {
  it("suggests the first name in lowercase", () => {
    expect(getBookingLinkSlugSuggestion("Ada Lovelace")).toBe("ada");
  });

  it("does not derive a slug from an email address", () => {
    expect(getBookingLinkSlugSuggestion("ada@example.com")).toBe(
      "booking-link",
    );
  });

  it("keeps short first names valid", () => {
    expect(getBookingLinkSlugSuggestion("Al Smith")).toBe("al-booking");
  });

  it("normalizes custom slugs", () => {
    expect(normalizeBookingSlug(" Intro Call! ")).toBe("intro-call");
  });
});
