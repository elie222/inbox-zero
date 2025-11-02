import { describe, expect, test, vi, beforeEach } from "vitest";
import { aiParseMeetingRequest } from "@/utils/meetings/parse-meeting-request";
import { getEmailAccount, getEmail } from "@/__tests__/helpers";

// Run with: pnpm test-ai ai-parse-meeting-request

vi.mock("server-only", () => ({}));

const TIMEOUT = 30_000;

// Skip tests unless explicitly running AI tests
const isAiTest = process.env.RUN_AI_TESTS === "true";

describe.runIf(isAiTest)("aiParseMeetingRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test(
    "extracts meeting details from a simple meeting request",
    async () => {
      const emailAccount = getEmailAccount();
      const email = getEmail({
        from: "john@example.com",
        to: emailAccount.email,
        subject: "Meeting to discuss Q4 strategy",
        content: `Hi,

Let's meet next Tuesday at 2pm to discuss our Q4 strategy and goals.

Looking forward to it!
John`,
      });

      const result = await aiParseMeetingRequest({
        email,
        emailAccount,
        userEmail: emailAccount.email,
      });

      console.debug("Result:", JSON.stringify(result, null, 2));

      expect(result.attendees).toContain(emailAccount.email);
      expect(result.attendees).toContain("john@example.com");
      expect(result.dateTimePreferences.length).toBeGreaterThan(0);
      expect(result.dateTimePreferences[0]).toMatch(/tuesday.*2pm/i);
      expect(result.title).toBeTruthy();
      expect(result.title.toLowerCase()).toContain("q4");
      expect(result.durationMinutes).toBe(60); // default
      expect(result.preferredProvider).toBeNull();
    },
    TIMEOUT,
  );

  test(
    "extracts Teams meeting preference",
    async () => {
      const emailAccount = getEmailAccount();
      const email = getEmail({
        from: "sarah@company.com",
        to: `${emailAccount.email}, mike@company.com`,
        subject: "Quick sync needed",
        content: `Team,

Can we have a quick 30-minute Teams call tomorrow at 10am?

We need to discuss the client feedback.

Thanks!
Sarah`,
      });

      const result = await aiParseMeetingRequest({
        email,
        emailAccount,
        userEmail: emailAccount.email,
      });

      console.debug("Result:", JSON.stringify(result, null, 2));

      expect(result.attendees).toContain(emailAccount.email);
      expect(result.attendees).toContain("sarah@company.com");
      expect(result.attendees).toContain("mike@company.com");
      expect(result.preferredProvider).toBe("teams");
      expect(result.durationMinutes).toBe(30);
      expect(result.dateTimePreferences[0]).toMatch(/tomorrow.*10am/i);
    },
    TIMEOUT,
  );

  test(
    "extracts Zoom meeting preference",
    async () => {
      const emailAccount = getEmailAccount();
      const email = getEmail({
        from: "alex@startup.com",
        to: emailAccount.email,
        subject: "Demo session",
        content: `Hey,

I'd love to schedule a Zoom demo to show you our new product features.

Are you available Friday afternoon, maybe 3pm or 4pm?

Best,
Alex`,
      });

      const result = await aiParseMeetingRequest({
        email,
        emailAccount,
        userEmail: emailAccount.email,
      });

      console.debug("Result:", JSON.stringify(result, null, 2));

      expect(result.preferredProvider).toBe("zoom");
      expect(result.attendees).toContain("alex@startup.com");
      expect(result.dateTimePreferences.length).toBeGreaterThan(0);
      expect(result.title.toLowerCase()).toContain("demo");
    },
    TIMEOUT,
  );

  test(
    "extracts Google Meet preference",
    async () => {
      const emailAccount = getEmailAccount();
      const email = getEmail({
        from: "recruiter@bigcorp.com",
        to: emailAccount.email,
        subject: "Interview for Senior Engineer Position",
        content: `Hi,

I'd like to schedule a 1-hour Google Meet interview for the Senior Engineer position.

Please let me know your availability next week.

Best regards,
Hiring Team`,
      });

      const result = await aiParseMeetingRequest({
        email,
        emailAccount,
        userEmail: emailAccount.email,
      });

      console.debug("Result:", JSON.stringify(result, null, 2));

      expect(result.preferredProvider).toBe("google-meet");
      expect(result.durationMinutes).toBe(60);
      expect(result.title.toLowerCase()).toContain("interview");
    },
    TIMEOUT,
  );

  test(
    "detects urgency in meeting request",
    async () => {
      const emailAccount = getEmailAccount();
      const email = getEmail({
        from: "boss@company.com",
        to: emailAccount.email,
        subject: "URGENT: Need to discuss incident",
        content: `Hi,

We need to meet ASAP to discuss the production incident from this morning.

Can you join a call in the next hour?

Thanks`,
      });

      const result = await aiParseMeetingRequest({
        email,
        emailAccount,
        userEmail: emailAccount.email,
      });

      console.debug("Result:", JSON.stringify(result, null, 2));

      expect(result.isUrgent).toBe(true);
      expect(result.title.toLowerCase()).toContain("incident");
    },
    TIMEOUT,
  );

  test(
    "extracts in-person meeting location",
    async () => {
      const emailAccount = getEmailAccount();
      const email = getEmail({
        from: "team@office.com",
        to: `${emailAccount.email}, jane@office.com`,
        subject: "Team lunch meeting",
        content: `Team,

Let's meet for lunch next Wednesday at 12pm in Conference Room A.

We'll discuss the roadmap for next quarter.

See you there!`,
      });

      const result = await aiParseMeetingRequest({
        email,
        emailAccount,
        userEmail: emailAccount.email,
      });

      console.debug("Result:", JSON.stringify(result, null, 2));

      expect(result.location).toBeTruthy();
      expect(result.location?.toLowerCase()).toContain("conference room");
      expect(result.dateTimePreferences[0]).toMatch(/wednesday.*12pm/i);
    },
    TIMEOUT,
  );

  test(
    "handles multiple attendees from CC field",
    async () => {
      const emailAccount = getEmailAccount();
      const email = getEmail({
        from: "pm@company.com",
        to: emailAccount.email,
        cc: "dev1@company.com, dev2@company.com, designer@company.com",
        subject: "Sprint planning meeting",
        content: `Hi team,

Let's schedule our sprint planning for Monday morning at 9am.

We'll review the backlog and plan the next two weeks.

Thanks!`,
      });

      const result = await aiParseMeetingRequest({
        email,
        emailAccount,
        userEmail: emailAccount.email,
      });

      console.debug("Result:", JSON.stringify(result, null, 2));

      expect(result.attendees.length).toBeGreaterThanOrEqual(4);
      expect(result.attendees).toContain("pm@company.com");
      expect(result.attendees).toContain("dev1@company.com");
      expect(result.attendees).toContain("dev2@company.com");
      expect(result.attendees).toContain("designer@company.com");
    },
    TIMEOUT,
  );

  test(
    "extracts agenda from detailed email",
    async () => {
      const emailAccount = getEmailAccount();
      const email = getEmail({
        from: "lead@team.com",
        to: emailAccount.email,
        subject: "Architecture review meeting",
        content: `Hi,

I'd like to schedule a 90-minute architecture review meeting.

Agenda:
1. Review current microservices architecture
2. Discuss scaling challenges
3. Propose solutions for database optimization
4. Q&A

Let me know when you're available this week.

Best,
Tech Lead`,
      });

      const result = await aiParseMeetingRequest({
        email,
        emailAccount,
        userEmail: emailAccount.email,
      });

      console.debug("Result:", JSON.stringify(result, null, 2));

      expect(result.durationMinutes).toBe(90);
      expect(result.agenda).toBeTruthy();
      expect(result.agenda?.toLowerCase()).toContain("architecture");
      expect(result.title.toLowerCase()).toContain("architecture");
    },
    TIMEOUT,
  );

  test(
    "handles meeting request with no specific time mentioned",
    async () => {
      const emailAccount = getEmailAccount();
      const email = getEmail({
        from: "client@external.com",
        to: emailAccount.email,
        subject: "Let's discuss the proposal",
        content: `Hi,

I'd like to schedule a call to discuss your proposal.

When would be a good time for you?

Thanks,
Client`,
      });

      const result = await aiParseMeetingRequest({
        email,
        emailAccount,
        userEmail: emailAccount.email,
      });

      console.debug("Result:", JSON.stringify(result, null, 2));

      expect(result.attendees).toContain(emailAccount.email);
      expect(result.attendees).toContain("client@external.com");
      expect(result.dateTimePreferences).toEqual([]);
      expect(result.title).toBeTruthy();
    },
    TIMEOUT,
  );

  test(
    "extracts notes for special requests",
    async () => {
      const emailAccount = getEmailAccount();
      const email = getEmail({
        from: "speaker@conference.com",
        to: emailAccount.email,
        subject: "Pre-conference speaker briefing",
        content: `Hi,

We need to schedule a 45-minute briefing call before your talk.

Please have your presentation slides ready to share during the call.

We'll also need to test your audio setup.

Let me know your availability this week.

Thanks,
Conference Team`,
      });

      const result = await aiParseMeetingRequest({
        email,
        emailAccount,
        userEmail: emailAccount.email,
      });

      console.debug("Result:", JSON.stringify(result, null, 2));

      expect(result.durationMinutes).toBe(45);
      expect(result.notes).toBeTruthy();
      expect(result.notes?.toLowerCase()).toMatch(/slides|presentation|audio/);
    },
    TIMEOUT,
  );

  test(
    "handles self-reminder email (email to yourself)",
    async () => {
      const emailAccount = getEmailAccount();
      const email = getEmail({
        from: emailAccount.email,
        to: emailAccount.email,
        subject: "Schedule: Team standup for next sprint",
        content: `/schedule meeting

Need to schedule our daily standup for the next sprint starting Monday.

Attendees: ${emailAccount.email}, dev@team.com, qa@team.com
Time: Every weekday at 9:30am
Duration: 15 minutes
Use Teams`,
      });

      const result = await aiParseMeetingRequest({
        email,
        emailAccount,
        userEmail: emailAccount.email,
      });

      console.debug("Result:", JSON.stringify(result, null, 2));

      expect(result.attendees).toContain("dev@team.com");
      expect(result.attendees).toContain("qa@team.com");
      expect(result.preferredProvider).toBe("teams");
      expect(result.durationMinutes).toBe(15);
      expect(result.title.toLowerCase()).toContain("standup");
    },
    TIMEOUT,
  );
});
