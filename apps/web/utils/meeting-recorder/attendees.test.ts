import { describe, expect, it } from "vitest";
import {
  getFollowUpRecipients,
  toAttendeeSnapshot,
} from "@/utils/meeting-recorder/attendees";

describe("meeting attendee snapshots", () => {
  it("includes an organizer omitted from the provider attendee collection", () => {
    const snapshot = toAttendeeSnapshot(
      [{ email: "user@example.com" }],
      "host@example.com",
    );

    expect(getFollowUpRecipients(snapshot, "user@example.com")).toEqual([
      { email: "host@example.com" },
    ]);
  });
});
