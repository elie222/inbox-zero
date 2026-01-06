import { describe, it, expect } from "vitest";
import {
  BellIcon,
  BriefcaseIcon,
  CalendarIcon,
  CircleHelpIcon,
  CodeIcon,
  CreditCardIcon,
  GlobeIcon,
  HeadphonesIcon,
  MailIcon,
  MegaphoneIcon,
  NewspaperIcon,
  ReceiptIcon,
  ScaleIcon,
  ShoppingCartIcon,
  TagIcon,
  UserIcon,
  UserCircleIcon,
  UsersIcon,
} from "lucide-react";
import { getCategoryIcon } from "./categoryIcons";

describe("getCategoryIcon", () => {
  describe("newsletter categories", () => {
    it("should return NewspaperIcon for newsletter category", () => {
      expect(getCategoryIcon("Newsletter")).toBe(NewspaperIcon);
      expect(getCategoryIcon("Newsletters")).toBe(NewspaperIcon);
      expect(getCategoryIcon("Weekly Newsletter")).toBe(NewspaperIcon);
    });
  });

  describe("marketing categories", () => {
    it("should return MegaphoneIcon for marketing category", () => {
      expect(getCategoryIcon("Marketing")).toBe(MegaphoneIcon);
      expect(getCategoryIcon("Email Marketing")).toBe(MegaphoneIcon);
    });

    it("should return MegaphoneIcon for promotion category", () => {
      expect(getCategoryIcon("Promotion")).toBe(MegaphoneIcon);
      expect(getCategoryIcon("Promotions")).toBe(MegaphoneIcon);
      expect(getCategoryIcon("Special Promotion")).toBe(MegaphoneIcon);
    });
  });

  describe("notification categories", () => {
    it("should return BellIcon for notification category", () => {
      expect(getCategoryIcon("Notification")).toBe(BellIcon);
      expect(getCategoryIcon("Notifications")).toBe(BellIcon);
      expect(getCategoryIcon("Account Notification")).toBe(BellIcon);
    });

    it("should return BellIcon for alert category", () => {
      expect(getCategoryIcon("Alert")).toBe(BellIcon);
      expect(getCategoryIcon("Alerts")).toBe(BellIcon);
      expect(getCategoryIcon("Security Alert")).toBe(BellIcon);
    });
  });

  describe("receipt categories", () => {
    it("should return ReceiptIcon for receipt category", () => {
      expect(getCategoryIcon("Receipt")).toBe(ReceiptIcon);
      expect(getCategoryIcon("Receipts")).toBe(ReceiptIcon);
      expect(getCategoryIcon("Purchase Receipt")).toBe(ReceiptIcon);
    });

    it("should return ReceiptIcon for invoice category", () => {
      expect(getCategoryIcon("Invoice")).toBe(ReceiptIcon);
      expect(getCategoryIcon("Invoices")).toBe(ReceiptIcon);
    });
  });

  describe("social categories", () => {
    it("should return UsersIcon for social category", () => {
      expect(getCategoryIcon("Social")).toBe(UsersIcon);
      expect(getCategoryIcon("Social Media")).toBe(UsersIcon);
    });

    it("should return UsersIcon for team category", () => {
      expect(getCategoryIcon("Team")).toBe(UsersIcon);
      expect(getCategoryIcon("Team Updates")).toBe(UsersIcon);
    });
  });

  describe("shopping categories", () => {
    it("should return ShoppingCartIcon for shopping category", () => {
      expect(getCategoryIcon("Shopping")).toBe(ShoppingCartIcon);
      expect(getCategoryIcon("Online Shopping")).toBe(ShoppingCartIcon);
    });

    it("should return ShoppingCartIcon for order category", () => {
      expect(getCategoryIcon("Order")).toBe(ShoppingCartIcon);
      expect(getCategoryIcon("Orders")).toBe(ShoppingCartIcon);
      expect(getCategoryIcon("Order Confirmation")).toBe(ShoppingCartIcon);
    });
  });

  describe("finance categories", () => {
    it("should return CreditCardIcon for finance category", () => {
      expect(getCategoryIcon("Finance")).toBe(CreditCardIcon);
      expect(getCategoryIcon("Personal Finance")).toBe(CreditCardIcon);
    });

    it("should return CreditCardIcon for bank category", () => {
      expect(getCategoryIcon("Bank")).toBe(CreditCardIcon);
      expect(getCategoryIcon("Banking")).toBe(CreditCardIcon);
    });

    it("should return CreditCardIcon for pay category", () => {
      expect(getCategoryIcon("Pay")).toBe(CreditCardIcon);
      expect(getCategoryIcon("Payment")).toBe(CreditCardIcon);
      expect(getCategoryIcon("Payroll")).toBe(CreditCardIcon);
    });
  });

  describe("work categories", () => {
    it("should return BriefcaseIcon for work category", () => {
      expect(getCategoryIcon("Work")).toBe(BriefcaseIcon);
      expect(getCategoryIcon("Work Updates")).toBe(BriefcaseIcon);
    });

    it("should return BriefcaseIcon for job category", () => {
      expect(getCategoryIcon("Job")).toBe(BriefcaseIcon);
      expect(getCategoryIcon("Job Openings")).toBe(BriefcaseIcon);
    });

    it("should return BriefcaseIcon for career category", () => {
      expect(getCategoryIcon("Career")).toBe(BriefcaseIcon);
      expect(getCategoryIcon("Career Opportunities")).toBe(BriefcaseIcon);
    });

    it("should prioritize notification/alert keywords over job keyword", () => {
      // "Job Alerts" contains "alert" which is matched before "job"
      expect(getCategoryIcon("Job Alerts")).toBe(BellIcon);
    });
  });

  describe("developer categories", () => {
    it("should return CodeIcon for developer category", () => {
      expect(getCategoryIcon("Developer")).toBe(CodeIcon);
      expect(getCategoryIcon("Developer Updates")).toBe(CodeIcon);
    });

    it("should return CodeIcon for github category", () => {
      expect(getCategoryIcon("GitHub")).toBe(CodeIcon);
      expect(getCategoryIcon("Github Issues")).toBe(CodeIcon);
    });

    it("should prioritize notification keyword over github keyword", () => {
      // "Github Notifications" contains "notification" which is matched before "github"
      expect(getCategoryIcon("Github Notifications")).toBe(BellIcon);
    });

    it("should return CodeIcon for code category", () => {
      expect(getCategoryIcon("Code")).toBe(CodeIcon);
      expect(getCategoryIcon("Code Review")).toBe(CodeIcon);
    });
  });

  describe("travel categories", () => {
    it("should return GlobeIcon for travel category", () => {
      expect(getCategoryIcon("Travel")).toBe(GlobeIcon);
      expect(getCategoryIcon("Travel Deals")).toBe(GlobeIcon);
    });

    it("should return GlobeIcon for flight category", () => {
      expect(getCategoryIcon("Flight")).toBe(GlobeIcon);
      expect(getCategoryIcon("Flight Updates")).toBe(GlobeIcon);
    });
  });

  describe("sale categories", () => {
    it("should return TagIcon for sale category", () => {
      expect(getCategoryIcon("Sale")).toBe(TagIcon);
      expect(getCategoryIcon("Sales")).toBe(TagIcon);
      expect(getCategoryIcon("Flash Sale")).toBe(TagIcon);
    });

    it("should return TagIcon for deal category", () => {
      expect(getCategoryIcon("Deal")).toBe(TagIcon);
      expect(getCategoryIcon("Deals")).toBe(TagIcon);
      expect(getCategoryIcon("Daily Deals")).toBe(TagIcon);
    });

    it("should return TagIcon for discount category", () => {
      expect(getCategoryIcon("Discount")).toBe(TagIcon);
      expect(getCategoryIcon("Discounts")).toBe(TagIcon);
    });
  });

  describe("uncategorized categories", () => {
    it("should return CircleHelpIcon for uncategorized category", () => {
      expect(getCategoryIcon("Uncategorized")).toBe(CircleHelpIcon);
    });

    it("should return CircleHelpIcon for unknown category", () => {
      expect(getCategoryIcon("Unknown")).toBe(CircleHelpIcon);
    });
  });

  describe("legal categories", () => {
    it("should return ScaleIcon for legal category", () => {
      expect(getCategoryIcon("Legal")).toBe(ScaleIcon);
      expect(getCategoryIcon("Legal Documents")).toBe(ScaleIcon);
    });

    it("should return ScaleIcon for law category", () => {
      expect(getCategoryIcon("Law")).toBe(ScaleIcon);
      expect(getCategoryIcon("Law Firm")).toBe(ScaleIcon);
    });

    it("should return ScaleIcon for contract category", () => {
      expect(getCategoryIcon("Contract")).toBe(ScaleIcon);
      expect(getCategoryIcon("Contracts")).toBe(ScaleIcon);
    });
  });

  describe("support categories", () => {
    it("should return HeadphonesIcon for support category", () => {
      expect(getCategoryIcon("Support")).toBe(HeadphonesIcon);
      expect(getCategoryIcon("Tech Support")).toBe(HeadphonesIcon);
    });

    it("should return HeadphonesIcon for help category", () => {
      expect(getCategoryIcon("Help")).toBe(HeadphonesIcon);
      expect(getCategoryIcon("Help Desk")).toBe(HeadphonesIcon);
    });

    it("should return HeadphonesIcon for customer category", () => {
      expect(getCategoryIcon("Customer")).toBe(HeadphonesIcon);
      expect(getCategoryIcon("Customer Service")).toBe(HeadphonesIcon);
    });
  });

  describe("personal categories", () => {
    it("should return UserIcon for personal category", () => {
      expect(getCategoryIcon("Personal")).toBe(UserIcon);
      expect(getCategoryIcon("Personal Emails")).toBe(UserIcon);
    });

    it("should return UserIcon for private category", () => {
      expect(getCategoryIcon("Private")).toBe(UserIcon);
      expect(getCategoryIcon("Private Messages")).toBe(UserIcon);
    });
  });

  describe("event categories", () => {
    it("should return CalendarIcon for event category", () => {
      expect(getCategoryIcon("Event")).toBe(CalendarIcon);
      expect(getCategoryIcon("Events")).toBe(CalendarIcon);
    });

    it("should return CalendarIcon for calendar category", () => {
      expect(getCategoryIcon("Calendar")).toBe(CalendarIcon);
      expect(getCategoryIcon("Calendar Invite")).toBe(CalendarIcon);
    });

    it("should return CalendarIcon for meeting category", () => {
      expect(getCategoryIcon("Meeting")).toBe(CalendarIcon);
      expect(getCategoryIcon("Meetings")).toBe(CalendarIcon);
    });
  });

  describe("account categories", () => {
    it("should return UserCircleIcon for account category", () => {
      expect(getCategoryIcon("Account")).toBe(UserCircleIcon);
      expect(getCategoryIcon("Account Settings")).toBe(UserCircleIcon);
    });

    it("should return UserCircleIcon for profile category", () => {
      expect(getCategoryIcon("Profile")).toBe(UserCircleIcon);
      expect(getCategoryIcon("Profile Updates")).toBe(UserCircleIcon);
    });
  });

  describe("default fallback", () => {
    it("should return MailIcon for unrecognized categories", () => {
      expect(getCategoryIcon("Random")).toBe(MailIcon);
      expect(getCategoryIcon("Something Else")).toBe(MailIcon);
      expect(getCategoryIcon("xyz123")).toBe(MailIcon);
    });

    it("should return MailIcon for empty string", () => {
      expect(getCategoryIcon("")).toBe(MailIcon);
    });
  });

  describe("case insensitivity", () => {
    it("should match categories case-insensitively", () => {
      expect(getCategoryIcon("NEWSLETTER")).toBe(NewspaperIcon);
      expect(getCategoryIcon("newsletter")).toBe(NewspaperIcon);
      expect(getCategoryIcon("Newsletter")).toBe(NewspaperIcon);
      expect(getCategoryIcon("NeWsLeTtEr")).toBe(NewspaperIcon);
    });
  });
});
