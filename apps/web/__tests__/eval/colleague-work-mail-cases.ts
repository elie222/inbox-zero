import { getEmail } from "@/__tests__/helpers";

// Person-to-person work mail from colleagues must not be filed as an automated
// notification, while real automated notifications still are. Every person,
// company and domain here is made up.
export const colleagueWorkMailCases: {
  email: ReturnType<typeof getEmail>;
  expectedRule: string | string[];
}[] = [
  {
    email: getEmail({
      from: "Dana Levi <dana@test.com>",
      to: "user@test.com",
      subject:
        "Invitation: Q3 roadmap review @ Tue Mar 17, 2026 11am - 12pm (PST) (user@test.com)",
      content:
        "Dana Levi has invited you to Q3 roadmap review.\n\nHi, I'd like us to walk through the roadmap before the planning offsite. Please bring your top three priorities for the quarter.\n\nWhen: Tuesday Mar 17, 2026 11am – 12pm (PST)\nJoining info: meet.google.com/xyz-abcd-efg\nOrganizer: dana@test.com\nGuests: user@test.com, sam@test.com\n\nGoing (user@test.com)? Yes - Maybe - No\n\nInvitation from Google Calendar",
    }),
    expectedRule: ["Calendar", "Conversations"],
  },
  {
    email: getEmail({
      from: "Omar Haddad <omar@test.com>",
      to: "user@test.com",
      subject: "Meeting request: 1:1 to go over the vendor contract",
      content:
        "Omar Haddad has sent you a meeting request.\n\nWhen: Thursday, March 19, 2026 3:00 PM-3:30 PM (UTC+00:00)\nWhere: Microsoft Teams meeting\n\nHey, legal sent back their comments on the vendor contract. Can we spend 30 minutes going through the open points together before I reply to them?\n\nAccept | Tentative | Decline | Propose new time",
    }),
    expectedRule: ["Calendar", "Conversations"],
  },
  {
    email: getEmail({
      from: "Marcus Webb <marcus@test.com>",
      to: "user@test.com",
      subject: "Status update: payments migration",
      content:
        "Hi,\n\nQuick status update on the payments migration.\n\nDone: card payments now run on the new provider in staging.\nIn progress: refund flow, should be finished by Wednesday.\nBlocked: still waiting on production API keys from finance.\n\nNo action needed from you yet, I'll let you know if the key request stalls.\n\nMarcus",
    }),
    expectedRule: "Conversations",
  },
  {
    email: getEmail({
      from: "Priya Nair <priya@test.com>",
      to: "user@test.com",
      subject: "Weekly update - design team",
      content:
        "Hi all,\n\nHere's where the design team is this week:\n- Onboarding redesign is through user testing; the main fix is a shorter first step.\n- Mobile settings screens are ready for engineering handoff on Monday.\n- I'm out Friday, Leo is covering design reviews.\n\nThanks,\nPriya",
    }),
    expectedRule: "Conversations",
  },
  {
    email: getEmail({
      from: "alerts@uptimewatch.example",
      to: "user@test.com",
      subject: "[Alert] api-prod error rate above 5% for 10 minutes",
      content:
        "Monitor: api-prod 5xx rate\nStatus: TRIGGERED\nCurrent value: 7.2% (threshold 5%)\nStarted: Mar 16, 2026 09:14 UTC\n\nView monitor: https://app.uptimewatch.example/monitors/4821\nYou are receiving this because you are on the on-call notification list.",
    }),
    expectedRule: "Notification",
  },
  {
    email: getEmail({
      from: "notifications@tracker.example",
      to: "user@test.com",
      subject: "[PAY-142] Status changed: In Progress → In Review",
      content:
        "Marcus Webb changed the status of PAY-142 Refund flow on new provider from In Progress to In Review.\n\nView issue: https://tracker.example/browse/PAY-142\n\nYou're receiving this because you're watching this issue. Manage notification settings.",
    }),
    expectedRule: "Notification",
  },
  {
    email: getEmail({
      from: "no-reply@accounts.cloudnotes.example",
      to: "user@test.com",
      subject: "Your password was changed",
      content:
        "The password for your CloudNotes account was changed on Mar 16, 2026 at 18:02 UTC. If you made this change, no action is needed. If you didn't, reset your password and contact support immediately.",
    }),
    expectedRule: "Notification",
  },
  {
    email: getEmail({
      from: "no-reply@accounts.cloudnotes.example",
      to: "user@test.com",
      subject: "Reset your CloudNotes password",
      content:
        "We received a request to reset the password for your CloudNotes account. Use the link below to choose a new one: https://cloudnotes.example/reset?token=synthetic-example. The link expires in 30 minutes. If you didn't ask for this, ignore this email.",
    }),
    expectedRule: ["OTP", "Notification"],
  },
];
