import { describe, it, expect } from "vitest";
import { render } from "@react-email/render";
import DigestV2Email, { type DigestV2Props } from "../emails/digest-v2";

const fixture: DigestV2Props = {
  date: "Monday, May 4, 2026",
  narrativeGreeting: "Morning, Rebekah —",
  narrativeBody:
    "Two urgent items waiting on your reply, three roll-ups for cool-down reading.",
  urgent: [
    {
      subject: "Lease renewal",
      senderName: "Landlord",
      summary: "Sign by Friday.",
    },
  ],
  uncertain: [
    {
      subject: "Possible vendor outreach",
      senderName: "Acme",
      summary: "Sounds like a sales pitch.",
      reviewUrl: "https://inbox.tdfurn.com/uncertain/abc",
    },
  ],
  autoFiled: [
    {
      category: "receipts",
      title: "Receipts",
      emailCount: 4,
      clusterCount: 2,
      rows: [
        { label: "Starbucks", summary: "Two reloads totalling $40." },
        { label: "Amazon", summary: "One delivery confirmation." },
      ],
    },
    {
      category: "newsletters",
      title: "Newsletters",
      emailCount: 6,
      clusterCount: 1,
      rows: [
        {
          label: "Tech & politics",
          summary: "Six newsletters; nothing time-sensitive.",
        },
      ],
    },
    {
      category: "marketing",
      title: "Marketing",
      emailCount: 3,
      clusterCount: 2,
      rows: [
        { label: "Deals — outdoor", summary: "REI 20% sale ends Sunday." },
        { label: "Deals — software", summary: "Adobe 40% off CC." },
      ],
    },
    {
      category: "notifications",
      title: "Notifications",
      emailCount: 2,
      clusterCount: 1,
      rows: [{ label: "GitHub", summary: "Two PR review reminders." }],
    },
  ],
};

describe("digest-v2.tsx prop-driven render", () => {
  it("renders narrativeGreeting and narrativeBody verbatim from props", async () => {
    const html = await render(<DigestV2Email {...fixture} />);
    expect(html).toContain("Morning, Rebekah —");
    expect(html).toContain("Two urgent items waiting on your reply");
  });

  it("renders one card per urgent[] entry with subject + summary", async () => {
    const html = await render(<DigestV2Email {...fixture} />);
    expect(html).toContain("Lease renewal");
    expect(html).toContain("Sign by Friday.");
  });

  it("renders Marketing rows with 'Deals — ' prefix when Sonnet labels them so", async () => {
    const html = await render(<DigestV2Email {...fixture} />);
    expect(html).toContain("Deals — outdoor");
    expect(html).toContain("Deals — software");
  });

  it("renders auto-filed sections in fixed order: receipts → newsletters → marketing → notifications", async () => {
    const html = await render(<DigestV2Email {...fixture} />);
    const idx = (s: string) => html.indexOf(s);
    expect(idx("Receipts")).toBeLessThan(idx("Newsletters"));
    expect(idx("Newsletters")).toBeLessThan(idx("Marketing"));
    expect(idx("Marketing")).toBeLessThan(idx("Notifications"));
  });
});
