import { describe, it, expect } from "vitest";
import { updateMeetingSchedulerSettingsBody } from "@/utils/actions/meeting-scheduler.validation";

describe("Meeting Scheduler Settings Validation", () => {
  describe("updateMeetingSchedulerSettingsBody", () => {
    it("should accept valid meetingSchedulerEnabled", () => {
      const result = updateMeetingSchedulerSettingsBody.safeParse({
        meetingSchedulerEnabled: true,
      });
      expect(result.success).toBe(true);
    });

    it("should accept valid meetingSchedulerDefaultDuration", () => {
      const result = updateMeetingSchedulerSettingsBody.safeParse({
        meetingSchedulerDefaultDuration: 60,
      });
      expect(result.success).toBe(true);
    });

    it("should reject meetingSchedulerDefaultDuration below minimum", () => {
      const result = updateMeetingSchedulerSettingsBody.safeParse({
        meetingSchedulerDefaultDuration: 10,
      });
      expect(result.success).toBe(false);
    });

    it("should reject meetingSchedulerDefaultDuration above maximum", () => {
      const result = updateMeetingSchedulerSettingsBody.safeParse({
        meetingSchedulerDefaultDuration: 300,
      });
      expect(result.success).toBe(false);
    });

    it("should accept valid meetingSchedulerPreferredProvider", () => {
      const providers = ["auto", "teams", "google-meet", "zoom", "none"];
      providers.forEach((provider) => {
        const result = updateMeetingSchedulerSettingsBody.safeParse({
          meetingSchedulerPreferredProvider: provider,
        });
        expect(result.success).toBe(true);
      });
    });

    it("should accept null meetingSchedulerPreferredProvider", () => {
      const result = updateMeetingSchedulerSettingsBody.safeParse({
        meetingSchedulerPreferredProvider: null,
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid meetingSchedulerPreferredProvider", () => {
      const result = updateMeetingSchedulerSettingsBody.safeParse({
        meetingSchedulerPreferredProvider: "invalid",
      });
      expect(result.success).toBe(false);
    });

    it("should accept valid working hours start", () => {
      const result = updateMeetingSchedulerSettingsBody.safeParse({
        meetingSchedulerWorkingHoursStart: 9,
      });
      expect(result.success).toBe(true);
    });

    it("should reject working hours start below 0", () => {
      const result = updateMeetingSchedulerSettingsBody.safeParse({
        meetingSchedulerWorkingHoursStart: -1,
      });
      expect(result.success).toBe(false);
    });

    it("should reject working hours start above 23", () => {
      const result = updateMeetingSchedulerSettingsBody.safeParse({
        meetingSchedulerWorkingHoursStart: 24,
      });
      expect(result.success).toBe(false);
    });

    it("should accept valid working hours end", () => {
      const result = updateMeetingSchedulerSettingsBody.safeParse({
        meetingSchedulerWorkingHoursEnd: 17,
      });
      expect(result.success).toBe(true);
    });

    it("should reject working hours end below 0", () => {
      const result = updateMeetingSchedulerSettingsBody.safeParse({
        meetingSchedulerWorkingHoursEnd: -1,
      });
      expect(result.success).toBe(false);
    });

    it("should reject working hours end above 23", () => {
      const result = updateMeetingSchedulerSettingsBody.safeParse({
        meetingSchedulerWorkingHoursEnd: 24,
      });
      expect(result.success).toBe(false);
    });

    it("should accept valid meetingSchedulerAutoCreate", () => {
      const result = updateMeetingSchedulerSettingsBody.safeParse({
        meetingSchedulerAutoCreate: true,
      });
      expect(result.success).toBe(true);
    });

    it("should accept all optional fields being undefined", () => {
      const result = updateMeetingSchedulerSettingsBody.safeParse({});
      expect(result.success).toBe(true);
    });

    it("should accept all valid fields together", () => {
      const result = updateMeetingSchedulerSettingsBody.safeParse({
        meetingSchedulerEnabled: true,
        meetingSchedulerDefaultDuration: 45,
        meetingSchedulerPreferredProvider: "teams",
        meetingSchedulerWorkingHoursStart: 8,
        meetingSchedulerWorkingHoursEnd: 18,
        meetingSchedulerAutoCreate: false,
      });
      expect(result.success).toBe(true);
    });

    it("should reject non-integer duration", () => {
      const result = updateMeetingSchedulerSettingsBody.safeParse({
        meetingSchedulerDefaultDuration: 30.5,
      });
      expect(result.success).toBe(false);
    });

    it("should reject non-integer working hours", () => {
      const result1 = updateMeetingSchedulerSettingsBody.safeParse({
        meetingSchedulerWorkingHoursStart: 9.5,
      });
      const result2 = updateMeetingSchedulerSettingsBody.safeParse({
        meetingSchedulerWorkingHoursEnd: 17.5,
      });
      expect(result1.success).toBe(false);
      expect(result2.success).toBe(false);
    });

    it("should reject non-boolean enabled field", () => {
      const result = updateMeetingSchedulerSettingsBody.safeParse({
        meetingSchedulerEnabled: "true",
      });
      expect(result.success).toBe(false);
    });

    it("should reject non-boolean autoCreate field", () => {
      const result = updateMeetingSchedulerSettingsBody.safeParse({
        meetingSchedulerAutoCreate: "false",
      });
      expect(result.success).toBe(false);
    });

    it("should accept edge case: working hours start = 0", () => {
      const result = updateMeetingSchedulerSettingsBody.safeParse({
        meetingSchedulerWorkingHoursStart: 0,
      });
      expect(result.success).toBe(true);
    });

    it("should accept edge case: working hours end = 23", () => {
      const result = updateMeetingSchedulerSettingsBody.safeParse({
        meetingSchedulerWorkingHoursEnd: 23,
      });
      expect(result.success).toBe(true);
    });

    it("should accept edge case: duration = 15 (minimum)", () => {
      const result = updateMeetingSchedulerSettingsBody.safeParse({
        meetingSchedulerDefaultDuration: 15,
      });
      expect(result.success).toBe(true);
    });

    it("should accept edge case: duration = 240 (maximum)", () => {
      const result = updateMeetingSchedulerSettingsBody.safeParse({
        meetingSchedulerDefaultDuration: 240,
      });
      expect(result.success).toBe(true);
    });
  });
});
