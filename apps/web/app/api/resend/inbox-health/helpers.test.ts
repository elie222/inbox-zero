import { describe, expect, it } from "vitest";
import { subDays } from "date-fns/subDays";
import { Frequency, NewsletterStatus } from "@/generated/prisma/enums";
import {
  getInboxHealthEmailData,
  getInboxHealthSkipReason,
  type InboxHealthSenderStats,
} from "./helpers";

describe("getInboxHealthEmailData", () => {
  it("returns null when there are fewer than 5 suggestions", () => {
    const senders = [
      makeSender({ name: "a@example.com", value: 10 }),
      makeSender({ name: "b@example.com", value: 10 }),
      makeSender({ name: "c@example.com", value: 10 }),
      makeSender({ name: "d@example.com", value: 10 }),
    ];

    expect(getInboxHealthEmailData(senders)).toBeNull();
  });

  it("ignores senders that are not unsubscribe suggestions", () => {
    const senders = [
      // 4 valid suggestions
      ...makeSenders(4),
      // well read
      makeSender({ name: "read@example.com", value: 20, readEmails: 18 }),
      // too few emails
      makeSender({ name: "rare@example.com", value: 2 }),
      // already handled
      makeSender({
        name: "handled@example.com",
        value: 20,
        status: NewsletterStatus.UNSUBSCRIBED,
      }),
    ];

    expect(getInboxHealthEmailData(senders)).toBeNull();
  });

  it("builds email data when there are at least 5 suggestions", () => {
    const senders = [
      makeSender({ name: "a@example.com", fromName: "A", value: 30 }),
      makeSender({ name: "b@example.com", fromName: "B", value: 10 }),
      makeSender({
        name: "c@example.com",
        fromName: "C",
        value: 50,
        readEmails: 3,
      }),
      makeSender({ name: "d@example.com", fromName: "D", value: 20 }),
      makeSender({ name: "e@example.com", fromName: "", value: 40 }),
    ];

    const data = getInboxHealthEmailData(senders);

    expect(data).not.toBeNull();
    expect(data?.suggestionCount).toBe(5);
    // (30 + 10 + 50 + 20 + 40) * 4
    expect(data?.yearlyEmailsAvoided).toBe(600);
    // Sorted by email count descending
    expect(data?.senders.map((sender) => sender.email)).toEqual([
      "c@example.com",
      "e@example.com",
      "a@example.com",
      "d@example.com",
      "b@example.com",
    ]);
    // 3 / 50 = 6%
    expect(data?.senders[0].readPercentage).toBe(6);
    // Falls back to the email address when there is no display name
    expect(data?.senders[1].name).toBe("e@example.com");
  });

  it("lists at most 10 senders but counts all suggestions", () => {
    const senders = makeSenders(15);

    const data = getInboxHealthEmailData(senders);

    expect(data?.suggestionCount).toBe(15);
    expect(data?.senders).toHaveLength(10);
    // yearly estimate covers all 15 suggestions, not just the listed 10
    expect(data?.yearlyEmailsAvoided).toBe(15 * 10 * 4);
  });
});

describe("getInboxHealthSkipReason", () => {
  const now = new Date("2026-06-12T00:00:00Z");
  const eligibleAccount = {
    statsEmailFrequency: Frequency.WEEKLY,
    createdAt: subDays(now, 30),
    lastInboxHealthEmailAt: null,
    now,
  };

  it("allows sending for an eligible account", () => {
    expect(getInboxHealthSkipReason(eligibleAccount)).toBeNull();
  });

  it("skips when the user opted out of stats emails", () => {
    expect(
      getInboxHealthSkipReason({
        ...eligibleAccount,
        statsEmailFrequency: Frequency.NEVER,
      }),
    ).not.toBeNull();
  });

  it("skips accounts younger than 7 days", () => {
    expect(
      getInboxHealthSkipReason({
        ...eligibleAccount,
        createdAt: subDays(now, 6),
      }),
    ).not.toBeNull();

    expect(
      getInboxHealthSkipReason({
        ...eligibleAccount,
        createdAt: subDays(now, 8),
      }),
    ).toBeNull();
  });

  it("skips when an email was sent within the last 30 days", () => {
    expect(
      getInboxHealthSkipReason({
        ...eligibleAccount,
        lastInboxHealthEmailAt: subDays(now, 29),
      }),
    ).not.toBeNull();

    expect(
      getInboxHealthSkipReason({
        ...eligibleAccount,
        lastInboxHealthEmailAt: subDays(now, 31),
      }),
    ).toBeNull();
  });
});

function makeSender(
  overrides: Partial<InboxHealthSenderStats> & { name: string },
): InboxHealthSenderStats {
  return {
    fromName: "Sender",
    value: 10,
    readEmails: 0,
    ...overrides,
  };
}

function makeSenders(count: number): InboxHealthSenderStats[] {
  return Array.from({ length: count }, (_, i) =>
    makeSender({ name: `sender${i}@example.com`, value: 10 }),
  );
}
