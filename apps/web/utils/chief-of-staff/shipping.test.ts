import { describe, it, expect } from "vitest";
import { parseShippingEmail, buildShippingCalendarEvent } from "./shipping";
import { CALENDAR_IDS } from "./types";

describe("parseShippingEmail", () => {
  it("extracts item name from Amazon shipping subject", () => {
    const result = parseShippingEmail({
      from: "ship-confirm@amazon.com",
      subject: "Your order of Wireless Noise Cancelling Headphones has shipped",
    });
    expect(result).toBe("Wireless Noise Cancelling Headphones");
  });

  it("falls back to 'Order (domain)' for generic shipping sender", () => {
    const result = parseShippingEmail({
      from: "orders@somestore.com",
      subject: "Your order has been shipped",
    });
    expect(result).toBe("Order (somestore.com)");
  });

  it("returns 'Package (FedEx)' for FedEx tracking email", () => {
    const result = parseShippingEmail({
      from: "TrackingUpdates@fedex.com",
      subject: "FedEx Shipment 123456789: Your package is on its way",
    });
    expect(result).toBe("Package (FedEx)");
  });

  it("returns 'Package (UPS)' for UPS delivery email", () => {
    const result = parseShippingEmail({
      from: "pkginfo@ups.com",
      subject: "UPS Update: Package Scheduled for Delivery Today",
    });
    expect(result).toBe("Package (UPS)");
  });
});

describe("buildShippingCalendarEvent", () => {
  it("builds a correct all-day calendar event", () => {
    const today = new Date().toISOString().split("T")[0];
    const event = buildShippingCalendarEvent(
      "Wireless Headphones",
      "https://mail.google.com/mail/u/0/#inbox/abc123",
    );
    expect(event.summary).toBe("Shipping: Wireless Headphones");
    expect(event.description).toBe(
      "https://mail.google.com/mail/u/0/#inbox/abc123",
    );
    expect(event.calendarId).toBe(CALENDAR_IDS.personal);
    expect(event.start).toEqual({ date: today });
    expect(event.end).toEqual({ date: today });
  });
});
