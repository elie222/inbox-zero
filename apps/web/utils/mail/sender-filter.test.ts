import { describe, expect, it } from "vitest";
import {
  senderFilterSchema,
  matchesSenderFilter,
} from "@/utils/mail/sender-filter";

describe("sender filters", () => {
  it.each([
    "@example.com",
    "@mail.example.com",
    "User@example.com",
  ])("accepts %s", (value) => {
    expect(senderFilterSchema.safeParse(value).success).toBe(true);
  });
  it.each([
    "example.com",
    "@a..com",
    "@-example.com",
    "@example-.com",
    "@example.com OR from:other",
    "@example.com/path",
  ])("rejects %s", (value) => {
    expect(senderFilterSchema.safeParse(value).success).toBe(false);
  });
  it.each([
    ["Person <USER@Example.com>", "@example.com", true],
    ["user@sub.example.com", "@example.com", false],
    ["user@notexample.com", "@example.com", false],
    ["user@example.com.evil", "@example.com", false],
    ["Example.com <user@other.com>", "@example.com", false],
    ["Person <USER@Example.com>", "user@example.com", true],
  ])("matches %s against %s", (sender, filter, expected) => {
    expect(matchesSenderFilter(sender, filter)).toBe(expected);
  });
});
