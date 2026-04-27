import type {
  DemoInboxAddress,
  DemoInboxFixture,
  DemoInboxMessage,
  DemoInboxThread,
} from "@/__tests__/fixtures/inboxes/types";

export const saasFounderMixedInbox: DemoInboxFixture = {
  id: "saasFounderMixed",
  name: "SaaS Founder Mixed Inbox",
  description:
    "A founder inbox with urgent customer work, security/billing alerts, operational digests, newsletters, recruiting, and cold sales.",
  mailbox: {
    email: "alex@northstarhq.com",
    displayName: "Alex Morgan",
    timezone: "America/Los_Angeles",
  },
  labels: baseLabels(),
  threads: [
    thread("18f51c0a769e2f41", [
      message({
        id: "18f51c0b4a9d7c02",
        from: person("Maya Chen", "maya@acme-customer.com"),
        subject: "Approval needed today: Q2 rollout copy",
        bodyText:
          "Can you approve the revised launch copy before 3pm? The customer team is blocked until we get a yes from you.",
        unread: true,
        labels: ["INBOX", "To Reply"],
        date: "2026-04-20T16:10:00.000Z",
      }),
      message({
        id: "18f51c0e1d6b90aa",
        from: person("Maya Chen", "maya@acme-customer.com"),
        subject: "Re: Approval needed today: Q2 rollout copy",
        bodyText:
          "Adding the final customer notes here. We can ship once you approve the highlighted paragraph.",
        unread: true,
        labels: ["INBOX", "To Reply"],
        date: "2026-04-20T17:25:00.000Z",
      }),
    ]),
    thread("18f51c1517ef3149", [
      message({
        id: "18f51c1674a83c6d",
        from: person("Nora Patel", "nora@northwindhq.com"),
        subject: "Escalation: renewal terms still unresolved",
        bodyText:
          "We need an answer on renewal terms before legal review tomorrow. If this slips, procurement will pause the renewal.",
        unread: true,
        labels: ["INBOX", "To Reply", "VIP Customer"],
        date: "2026-04-21T15:40:00.000Z",
      }),
      message({
        id: "18f51c18ad90ef32",
        from: person("Ari Cohen", "ari@northstarhq.com"),
        subject: "Re: Escalation: renewal terms still unresolved",
        bodyText:
          "I can jump in, but they are asking for your final position on the multi-year discount.",
        unread: false,
        labels: ["INBOX", "VIP Customer"],
        date: "2026-04-21T16:12:00.000Z",
      }),
    ]),
    thread("18f51c1e62cbb940", [
      message({
        id: "18f51c208d54b71a",
        from: person("AWS Security", "no-reply-aws@amazon.com"),
        subject: "Root MFA disabled on production account",
        bodyText:
          "Security alert: root multi-factor authentication was disabled on your production account. Review this event immediately.",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-21T03:05:00.000Z",
      }),
    ]),
    thread("18f51c24d1a6405c", [
      message({
        id: "18f51c25a97eb0d1",
        from: person("Okta Security", "security@okta.com"),
        subject: "New suspicious login detected",
        bodyText:
          "A new suspicious login was detected for your organization. Review this security alert and reset credentials if needed.",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-21T07:44:00.000Z",
      }),
    ]),
    thread("18f51c297ab3d84e", [
      message({
        id: "18f51c2a0e832979",
        from: person("Figma Billing", "billing@figma.com"),
        subject: "Payment failed for invoice INV-4432",
        bodyText:
          "Update your payment method to avoid service interruption. The failed invoice is INV-4432.",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-20T21:18:00.000Z",
      }),
    ]),
    thread("18f51c2e4a97b21f", [
      message({
        id: "18f51c2fd2a9146b",
        from: person("Vercel Billing", "billing@vercel.com"),
        subject: "Invoice payment failed",
        bodyText:
          "Please update your payment method for your Vercel team. Failed payments may disable production deployments.",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-22T06:15:00.000Z",
      }),
    ]),
    thread("18f51c34479cb286", [
      message({
        id: "18f51c353f6bd109",
        from: person("SOC2 Auditor", "auditor@secureframe.com"),
        subject: "Evidence request due Friday",
        bodyText:
          "Please upload access review evidence before Friday's audit checkpoint. We still need admin role exports.",
        unread: true,
        labels: ["INBOX", "To Reply"],
        date: "2026-04-21T19:30:00.000Z",
      }),
      message({
        id: "18f51c377206e4bc",
        from: person("SOC2 Auditor", "auditor@secureframe.com"),
        subject: "Re: Evidence request due Friday",
        bodyText:
          "Following up because the access review evidence is still missing from the portal.",
        unread: true,
        labels: ["INBOX", "To Reply"],
        date: "2026-04-22T13:10:00.000Z",
      }),
    ]),
    thread("18f51c3bb925a4f7", [
      message({
        id: "18f51c3c6cae1075",
        from: person("GitHub", "notifications@github.com"),
        subject: "Review requested on inbox-zero-ai#4821",
        bodyText:
          "You were requested as a reviewer for a pull request touching billing and rule automation.",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-22T09:05:00.000Z",
      }),
    ]),
    thread("18f51c409f36e2ad", [
      message({
        id: "18f51c4160bd8b2a",
        from: person("Vercel", "notifications@vercel.com"),
        subject: "Production deployment succeeded",
        bodyText:
          "inbox-zero-ai deployed successfully to production. Commit 4f91e7 is now live.",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-22T10:12:00.000Z",
      }),
    ]),
    thread("18f51c47ab305e91", [
      message({
        id: "18f51c4872d91c0a",
        from: person("Linear", "digest@linear.app"),
        subject: "Weekly workspace digest",
        bodyText:
          "12 issues closed, 8 issues created, and project updates from the workspace.",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-20T12:00:00.000Z",
      }),
    ]),
    thread("18f51c4c1a6d0bb2", [
      message({
        id: "18f51c4d8a035a0d",
        from: person("Lenny's Newsletter", "newsletter@lennysnewsletter.com"),
        subject: "This week: pricing pages that convert",
        bodyText:
          "New essay plus sponsor notes and upcoming events for product and growth teams.",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-20T14:00:00.000Z",
      }),
    ]),
    thread("18f51c51cb8450a4", [
      message({
        id: "18f51c5222ec01f6",
        from: person("Notion", "updates@mail.notion.so"),
        subject: "What's new in Notion this month",
        bodyText:
          "Product updates, templates, workspace improvements, and a monthly guide roundup.",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-19T18:10:00.000Z",
      }),
    ]),
    thread("18f51c56549273bf", [
      message({
        id: "18f51c571e9a4830",
        from: person("Vercel", "updates@vercel.com"),
        subject: "Vercel product update: new observability features",
        bodyText:
          "A monthly roundup of product launches, observability features, and guides.",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-18T15:20:00.000Z",
      }),
    ]),
    thread("18f51c5bd84ca9e2", [
      message({
        id: "18f51c5c9baf016e",
        from: person("Rina Levi", "rina@horizonsearch.co"),
        subject: "Final interview loop for Platform Lead",
        bodyText:
          "Can you confirm whether Thursday 11am works for the final interview loop?",
        unread: true,
        labels: ["INBOX", "To Reply"],
        date: "2026-04-22T11:45:00.000Z",
      }),
      message({
        id: "18f51c5f2ab740d3",
        from: person("Rina Levi", "rina@horizonsearch.co"),
        subject: "Re: Final interview loop for Platform Lead",
        bodyText:
          "The candidate can also do Friday afternoon if Thursday is too tight.",
        unread: false,
        labels: ["INBOX"],
        date: "2026-04-22T12:16:00.000Z",
      }),
    ]),
    thread("18f51c63f0a48bc8", [
      message({
        id: "18f51c64c77539a0",
        from: person("Stripe", "receipts@stripe.com"),
        subject: "Your receipt from OpenAI",
        bodyText:
          "Payment receipt for your monthly subscription. This is not a failed payment alert.",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-18T07:30:00.000Z",
      }),
    ]),
    thread("18f51c685b4d107e", [
      message({
        id: "18f51c6972ef2c45",
        from: person("Cal Parker", "cal@pipelinepilot.io"),
        subject: "Quick idea to 10x your pipeline",
        bodyText:
          "We help SaaS founders book more demos with AI outbound. Are you free for 15 minutes?",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-17T17:02:00.000Z",
      }),
    ]),
    thread("18f51c6d44a90e7b", [
      message({
        id: "18f51c6e1785b221",
        from: person("Leah Goldman", "leah@northstar.vc"),
        subject: "Follow-up on Q2 metrics",
        bodyText:
          "Thanks for the update. Could you send ARR, retention, and enterprise pipeline before our partner meeting?",
        unread: true,
        labels: ["INBOX", "To Reply"],
        date: "2026-04-22T14:42:00.000Z",
      }),
      message({
        id: "18f51c708364f9c1",
        from: person("Alex Morgan", "alex@northstarhq.com"),
        subject: "Re: Follow-up on Q2 metrics",
        bodyText: "Yes, I will send the full sheet after finance closes March.",
        unread: false,
        labels: ["SENT"],
        date: "2026-04-22T15:01:00.000Z",
      }),
    ]),
  ],
};

export const supportOpsHeavyInbox: DemoInboxFixture = {
  id: "supportOpsHeavy",
  name: "Support Ops Heavy Inbox",
  description:
    "A support lead inbox with customer bugs, refunds, docs questions, internal handoffs, and vendor noise.",
  mailbox: {
    email: "support@luminahq.com",
    displayName: "Sam Rivera",
    timezone: "America/New_York",
  },
  labels: baseLabels(),
  threads: [
    thread("18f51d0a33b82d45", [
      message({
        id: "18f51d0b4c16eae2",
        from: person("Taylor Brooks", "taylor@brightlane.co"),
        to: [person("Sam Rivera", "support@luminahq.com")],
        subject: "Refund approval needed for duplicate charge",
        bodyText:
          "We were charged twice for our annual plan and need approval before month end.",
        unread: true,
        labels: ["INBOX", "To Reply", "Refunds"],
        date: "2026-04-21T13:20:00.000Z",
      }),
    ]),
    thread("18f51d106ba349d0", [
      message({
        id: "18f51d11d90b8f7c",
        from: person("Priya Shah", "priya@enterpriseops.io"),
        to: [person("Sam Rivera", "support@luminahq.com")],
        subject: "P1 bug: exports failing for all admins",
        bodyText:
          "Exports have failed for every admin since this morning. Our compliance report is blocked.",
        unread: true,
        labels: ["INBOX", "To Reply"],
        date: "2026-04-22T09:30:00.000Z",
      }),
      message({
        id: "18f51d13ab624ef5",
        from: person("Engineering Triage", "triage@luminahq.com"),
        to: [person("Sam Rivera", "support@luminahq.com")],
        subject: "Re: P1 bug: exports failing for all admins",
        bodyText:
          "We confirmed the regression and need the customer's export job ID.",
        unread: false,
        labels: ["INBOX"],
        date: "2026-04-22T10:00:00.000Z",
      }),
    ]),
    thread("18f51d18194b3c62", [
      message({
        id: "18f51d19ea73bf0d",
        from: person("Jamie Ortiz", "jamie@riseops.co"),
        to: [person("Sam Rivera", "support@luminahq.com")],
        subject: "Question about webhook retry docs",
        bodyText:
          "Can you point me to the retry policy for failed webhooks? The docs page has two different values.",
        unread: true,
        labels: ["INBOX", "To Reply"],
        date: "2026-04-21T18:15:00.000Z",
      }),
    ]),
    thread("18f51d1d5e8b41a9", [
      message({
        id: "18f51d1e0587bc34",
        from: person("Intercom", "notifications@intercom.io"),
        to: [person("Sam Rivera", "support@luminahq.com")],
        subject: "Weekly CSAT digest",
        bodyText:
          "Your support inbox had 94 percent customer satisfaction this week.",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-20T12:00:00.000Z",
      }),
    ]),
    thread("18f51d22cc509f6a", [
      message({
        id: "18f51d2349af651e",
        from: person("Casey Miller", "casey@supportbench.ai"),
        to: [person("Sam Rivera", "support@luminahq.com")],
        subject: "Support automation benchmark report",
        bodyText:
          "We benchmark support teams and can show you how to lower ticket volume.",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-19T14:30:00.000Z",
      }),
    ]),
    thread("18f51d27f4a3b9c8", [
      message({
        id: "18f51d28c0e75a21",
        from: person("Statuspage", "noreply@statuspage.io"),
        to: [person("Sam Rivera", "support@luminahq.com")],
        subject: "Incident resolved: delayed notifications",
        bodyText:
          "The incident affecting delayed notifications has been resolved.",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-21T03:10:00.000Z",
      }),
    ]),
  ],
};

export const execCalendarRecruitingInbox: DemoInboxFixture = {
  id: "execCalendarRecruiting",
  name: "Executive Calendar and Recruiting Inbox",
  description:
    "An executive inbox focused on scheduling, recruiting loops, investor/admin messages, travel, and vendor mail.",
  mailbox: {
    email: "jordan@orbitworks.co",
    displayName: "Jordan Lee",
    timezone: "America/Los_Angeles",
  },
  labels: baseLabels(),
  threads: [
    thread("18f51e0a20c94177", [
      message({
        id: "18f51e0b174a6d85",
        from: person("Board Assistant", "assistant@northstar.vc"),
        to: [person("Jordan Lee", "jordan@orbitworks.co")],
        subject: "Board prep moved to Thursday",
        bodyText:
          "Can you confirm Thursday 2pm for board prep? The deck review is blocked on your availability.",
        unread: true,
        labels: ["INBOX", "To Reply"],
        date: "2026-04-22T16:30:00.000Z",
      }),
    ]),
    thread("18f51e10ad9f62cb", [
      message({
        id: "18f51e119c4b07f2",
        from: person("Talent Team", "talent@orbitworks.co"),
        to: [person("Jordan Lee", "jordan@orbitworks.co")],
        subject: "VP Sales candidate debrief",
        bodyText:
          "Please send your notes on the VP Sales candidate before the debrief at 4pm.",
        unread: true,
        labels: ["INBOX", "To Reply", "Recruiting"],
        date: "2026-04-22T12:20:00.000Z",
      }),
      message({
        id: "18f51e13f760a51d",
        from: person("Talent Team", "talent@orbitworks.co"),
        to: [person("Jordan Lee", "jordan@orbitworks.co")],
        subject: "Re: VP Sales candidate debrief",
        bodyText: "Adding the scorecard link and compensation notes here.",
        unread: false,
        labels: ["INBOX", "Recruiting"],
        date: "2026-04-22T13:05:00.000Z",
      }),
    ]),
    thread("18f51e18bb279fa0", [
      message({
        id: "18f51e19a35c0d6e",
        from: person("TripIt", "alerts@tripit.com"),
        to: [person("Jordan Lee", "jordan@orbitworks.co")],
        subject: "Flight change: SFO to JFK",
        bodyText:
          "Your SFO to JFK flight was delayed by 90 minutes. Connection risk is now high.",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-21T22:40:00.000Z",
      }),
    ]),
    thread("18f51e1d6e8a9243", [
      message({
        id: "18f51e1e42b67c1a",
        from: person("Northstar Ops", "ops@northstar.vc"),
        to: [person("Jordan Lee", "jordan@orbitworks.co")],
        subject: "Signature needed on updated side letter",
        bodyText:
          "Please sign the updated side letter today so legal can close the packet.",
        unread: true,
        labels: ["INBOX", "To Reply"],
        date: "2026-04-22T08:10:00.000Z",
      }),
    ]),
    thread("18f51e22dc3719b5", [
      message({
        id: "18f51e23a56d8420",
        from: person("Growth Vendor", "sales@growthvendor.io"),
        to: [person("Jordan Lee", "jordan@orbitworks.co")],
        subject: "Calendar benchmark for executive teams",
        bodyText:
          "We help executive teams recover calendar time. Can we book a quick demo?",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-20T15:10:00.000Z",
      }),
    ]),
    thread("18f51e278941f0ca", [
      message({
        id: "18f51e287b30d94e",
        from: person("Ramp", "digest@ramp.com"),
        to: [person("Jordan Lee", "jordan@orbitworks.co")],
        subject: "Weekly card activity digest",
        bodyText:
          "Your team had 43 card transactions this week. No approvals are pending.",
        unread: true,
        labels: ["INBOX"],
        date: "2026-04-19T16:00:00.000Z",
      }),
    ]),
  ],
};

function baseLabels() {
  return [
    { id: "INBOX", name: "INBOX", type: "system" as const },
    { id: "UNREAD", name: "UNREAD", type: "system" as const },
    { id: "SENT", name: "SENT", type: "system" as const },
    { id: "Label_To Reply", name: "To Reply", type: "user" as const },
    { id: "Label_FYI", name: "FYI", type: "user" as const },
    { id: "Label_Newsletter", name: "Newsletter", type: "user" as const },
    { id: "Label_Marketing", name: "Marketing", type: "user" as const },
    { id: "Label_Receipt", name: "Receipt", type: "user" as const },
    { id: "Label_Notification", name: "Notification", type: "user" as const },
    { id: "Label_VIP Customer", name: "VIP Customer", type: "user" as const },
    { id: "Label_Recruiting", name: "Recruiting", type: "user" as const },
    {
      id: "Label_Product Updates",
      name: "Product Updates",
      type: "user" as const,
    },
    { id: "Label_Security", name: "Security", type: "user" as const },
    { id: "Label_Billing", name: "Billing", type: "user" as const },
    { id: "Label_Refunds", name: "Refunds", type: "user" as const },
  ];
}

function thread(id: string, messages: DemoInboxMessage[]): DemoInboxThread {
  return { id, messages };
}

function message({
  id,
  from,
  to,
  cc,
  subject,
  bodyText,
  bodyHtml,
  date,
  unread,
  labels,
}: Omit<DemoInboxMessage, "to"> & { to?: DemoInboxAddress[] }) {
  return {
    id,
    from,
    to: to ?? [person("Alex Morgan", "alex@northstarhq.com")],
    cc,
    subject,
    bodyText,
    bodyHtml,
    date,
    unread,
    labels,
  };
}

function person(name: string, email: string): DemoInboxAddress {
  return { name, email };
}
