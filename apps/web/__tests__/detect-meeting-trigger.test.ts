import { describe, expect, test } from "vitest";
import { detectMeetingTrigger } from "@/utils/meetings/detect-meeting-trigger";

// Run with: pnpm test detect-meeting-trigger

describe("detectMeetingTrigger", () => {
  const userEmail = "user@example.com";

  describe("Schedule: in subject", () => {
    test("detects 'Schedule:' in subject (sent email)", () => {
      const result = detectMeetingTrigger({
        subject: "Schedule: Meeting with team",
        textBody: "Let's meet to discuss the project",
        htmlBody: null,
        fromEmail: userEmail,
        userEmail,
        isSent: true,
      });

      expect(result.isTriggered).toBe(true);
      expect(result.triggerType).toBe("schedule_subject");
      expect(result.isSentEmail).toBe(true);
    });

    test("detects 'schedule:' in subject (case-insensitive)", () => {
      const result = detectMeetingTrigger({
        subject: "schedule: team meeting",
        textBody: "Details about the meeting",
        htmlBody: null,
        fromEmail: userEmail,
        userEmail,
        isSent: true,
      });

      expect(result.isTriggered).toBe(true);
      expect(result.triggerType).toBe("schedule_subject");
    });

    test("detects 'SCHEDULE:' in subject (uppercase)", () => {
      const result = detectMeetingTrigger({
        subject: "SCHEDULE: IMPORTANT MEETING",
        textBody: "Meeting details",
        htmlBody: null,
        fromEmail: userEmail,
        userEmail,
        isSent: true,
      });

      expect(result.isTriggered).toBe(true);
      expect(result.triggerType).toBe("schedule_subject");
    });

    test("detects 'Schedule:' in email to yourself", () => {
      const result = detectMeetingTrigger({
        subject: "Schedule: Reminder to book meeting",
        textBody: "Book meeting with John next week",
        htmlBody: null,
        fromEmail: userEmail,
        userEmail,
        isSent: false,
      });

      expect(result.isTriggered).toBe(true);
      expect(result.triggerType).toBe("schedule_subject");
      expect(result.isSentEmail).toBe(false);
    });
  });

  describe("/schedule meeting command", () => {
    test("detects '/schedule meeting' in text body (sent email)", () => {
      const result = detectMeetingTrigger({
        subject: "Project discussion",
        textBody:
          "Hi team,\n\n/schedule meeting\n\nLet's discuss the Q4 roadmap.",
        htmlBody: null,
        fromEmail: userEmail,
        userEmail,
        isSent: true,
      });

      expect(result.isTriggered).toBe(true);
      expect(result.triggerType).toBe("schedule_command");
      expect(result.isSentEmail).toBe(true);
    });

    test("detects '/SCHEDULE MEETING' in body (case-insensitive)", () => {
      const result = detectMeetingTrigger({
        subject: "Meeting request",
        textBody: "/SCHEDULE MEETING for next week",
        htmlBody: null,
        fromEmail: userEmail,
        userEmail,
        isSent: true,
      });

      expect(result.isTriggered).toBe(true);
      expect(result.triggerType).toBe("schedule_command");
    });

    test("detects '/schedule meeting' in HTML body", () => {
      const result = detectMeetingTrigger({
        subject: "Project discussion",
        textBody: null,
        htmlBody:
          "<p>Hi team,</p><p>/schedule meeting</p><p>Let's discuss the Q4 roadmap.</p>",
        fromEmail: userEmail,
        userEmail,
        isSent: true,
      });

      expect(result.isTriggered).toBe(true);
      expect(result.triggerType).toBe("schedule_command");
    });

    test("detects '/schedule meeting' with extra spaces", () => {
      const result = detectMeetingTrigger({
        subject: "Meeting request",
        textBody: "/schedule   meeting for project review",
        htmlBody: null,
        fromEmail: userEmail,
        userEmail,
        isSent: true,
      });

      expect(result.isTriggered).toBe(true);
      expect(result.triggerType).toBe("schedule_command");
    });

    test("detects '/schedule meeting' in email to yourself", () => {
      const result = detectMeetingTrigger({
        subject: "Reminder",
        textBody: "/schedule meeting with the design team",
        htmlBody: null,
        fromEmail: userEmail,
        userEmail,
        isSent: false,
      });

      expect(result.isTriggered).toBe(true);
      expect(result.triggerType).toBe("schedule_command");
      expect(result.isSentEmail).toBe(false);
    });
  });

  describe("Priority: Subject over body", () => {
    test("prefers subject trigger over body trigger", () => {
      const result = detectMeetingTrigger({
        subject: "Schedule: Team sync",
        textBody: "/schedule meeting\n\nDetails about the meeting",
        htmlBody: null,
        fromEmail: userEmail,
        userEmail,
        isSent: true,
      });

      expect(result.isTriggered).toBe(true);
      // Subject trigger is checked first
      expect(result.triggerType).toBe("schedule_subject");
    });
  });

  describe("No trigger cases", () => {
    test("does not trigger for regular email from someone else", () => {
      const result = detectMeetingTrigger({
        subject: "Regular email",
        textBody: "Just a normal message",
        htmlBody: null,
        fromEmail: "other@example.com",
        userEmail,
        isSent: false,
      });

      expect(result.isTriggered).toBe(false);
      expect(result.triggerType).toBe(null);
    });

    test("does not trigger for 'scheduled' (not 'Schedule:')", () => {
      const result = detectMeetingTrigger({
        subject: "Meeting scheduled for tomorrow",
        textBody: "The meeting is already scheduled",
        htmlBody: null,
        fromEmail: userEmail,
        userEmail,
        isSent: true,
      });

      expect(result.isTriggered).toBe(false);
      expect(result.triggerType).toBe(null);
    });

    test("does not trigger for '/schedule' without 'meeting'", () => {
      const result = detectMeetingTrigger({
        subject: "Work schedule",
        textBody: "Please check your /schedule for next week",
        htmlBody: null,
        fromEmail: userEmail,
        userEmail,
        isSent: true,
      });

      expect(result.isTriggered).toBe(false);
      expect(result.triggerType).toBe(null);
    });

    test("does not trigger for 'schedule a meeting' (not the command)", () => {
      const result = detectMeetingTrigger({
        subject: "Question",
        textBody: "Can we schedule a meeting for next week?",
        htmlBody: null,
        fromEmail: userEmail,
        userEmail,
        isSent: true,
      });

      expect(result.isTriggered).toBe(false);
      expect(result.triggerType).toBe(null);
    });
  });

  describe("Email validation", () => {
    test("handles null subject gracefully", () => {
      const result = detectMeetingTrigger({
        subject: null,
        textBody: "/schedule meeting",
        htmlBody: null,
        fromEmail: userEmail,
        userEmail,
        isSent: true,
      });

      expect(result.isTriggered).toBe(true);
      expect(result.triggerType).toBe("schedule_command");
    });

    test("handles undefined subject gracefully", () => {
      const result = detectMeetingTrigger({
        subject: undefined,
        textBody: "/schedule meeting",
        htmlBody: null,
        fromEmail: userEmail,
        userEmail,
        isSent: true,
      });

      expect(result.isTriggered).toBe(true);
      expect(result.triggerType).toBe("schedule_command");
    });

    test("handles null body gracefully", () => {
      const result = detectMeetingTrigger({
        subject: "Schedule: Meeting",
        textBody: null,
        htmlBody: null,
        fromEmail: userEmail,
        userEmail,
        isSent: true,
      });

      expect(result.isTriggered).toBe(true);
      expect(result.triggerType).toBe("schedule_subject");
    });

    test("handles email addresses with different casing", () => {
      const result = detectMeetingTrigger({
        subject: "Schedule: Meeting",
        textBody: "Meeting details",
        htmlBody: null,
        fromEmail: "USER@EXAMPLE.COM",
        userEmail: "user@example.com",
        isSent: false,
      });

      expect(result.isTriggered).toBe(true);
      expect(result.triggerType).toBe("schedule_subject");
    });

    test("handles email addresses with whitespace", () => {
      const result = detectMeetingTrigger({
        subject: "Schedule: Meeting",
        textBody: "Meeting details",
        htmlBody: null,
        fromEmail: " user@example.com ",
        userEmail: "user@example.com",
        isSent: false,
      });

      expect(result.isTriggered).toBe(true);
      expect(result.triggerType).toBe("schedule_subject");
    });
  });
});
