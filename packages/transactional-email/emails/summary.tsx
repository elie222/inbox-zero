import {
  Body,
  Column,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";
import { StatsEmailFooter } from "./components/stats-email-footer";

type EmailItem = {
  from: string;
  subject: string;
  sentAt: Date;
};

type ArchivedEmailItem = EmailItem & {
  ruleName: string;
};

export interface SummaryEmailProps {
  archivedEmailCount?: number;
  archivedEmails?: ArchivedEmailItem[];
  awaitingReply?: EmailItem[];
  awaitingReplyCount?: number;
  baseUrl: string;
  coldEmailers: EmailItem[];
  needsAction?: EmailItem[];
  needsActionCount?: number;
  needsReply?: EmailItem[];
  // Reply tracker stats
  needsReplyCount?: number;
  // End of the week being summarized. Defaults to now.
  periodEnd?: Date;
  unsubscribeToken: string;
}

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const ACCENT = "#2563EB";

const BADGES = {
  green: { bg: "#F3FFEF", border: "#DDF4D3", color: "#17A34A" },
  orange: { bg: "#FFF5EF", border: "#FCE2D5", color: "#E65707" },
  blue: { bg: "#EFF6FF", border: "#D6E8FC", color: ACCENT },
};

export default function SummaryEmail(props: SummaryEmailProps) {
  const {
    baseUrl = "https://www.getinboxzero.com",
    archivedEmailCount = 0,
    archivedEmails = [],
    coldEmailers,
    needsReplyCount = 0,
    awaitingReplyCount = 0,
    needsActionCount = 0,
    needsReply = [],
    awaitingReply = [],
    needsAction = [],
    periodEnd = new Date(),
    unsubscribeToken,
  } = props;

  const coldEmailCount = coldEmailers.length;
  const preview = [
    `${archivedEmailCount} ${pluralize(archivedEmailCount, "email")} archived`,
    `${needsReplyCount} waiting on you`,
    `${coldEmailCount} cold ${pluralize(coldEmailCount, "email")} blocked`,
  ].join(", ");

  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}. Here's your week in email.</Preview>
      <Tailwind>
        <Body className="m-0 bg-[#FDFDFD] p-0" style={{ fontFamily: FONT }}>
          <Container className="mx-auto w-full max-w-[600px] px-3 pb-12 pt-10">
            <Text className="m-0 pb-9 text-center text-[20px] font-medium leading-6 tracking-[-0.02em] text-[#242424]">
              inbox zero
            </Text>

            <Section className="px-2 pb-7">
              <Text
                className="m-0 pb-2.5 text-[13px] font-semibold leading-[18px]"
                style={{ color: ACCENT }}
              >
                Weekly Update &middot; {formatPeriod(periodEnd)}
              </Text>
              <Text className="m-0 pb-3 text-[34px] font-medium leading-10 tracking-[-0.02em] text-[#242424]">
                Your week in email
              </Text>
              <Text className="m-0 text-[16px] leading-6 text-[#6D6E70]">
                Here's how your assistant handled your inbox this week, and what
                still needs you.
              </Text>
            </Section>

            <StatStrip
              stats={[
                { value: archivedEmailCount, label: "archived for you" },
                { value: needsReplyCount, label: "need your reply" },
                { value: coldEmailCount, label: "cold emails blocked" },
              ]}
            />

            <ArchivedEmails
              archivedEmailCount={archivedEmailCount}
              archivedEmails={archivedEmails}
              baseUrl={baseUrl}
            />

            <ReplyTracker
              needsReplyCount={needsReplyCount}
              awaitingReplyCount={awaitingReplyCount}
              needsActionCount={needsActionCount}
              needsReply={needsReply}
              awaitingReply={awaitingReply}
              needsAction={needsAction}
              baseUrl={baseUrl}
            />

            <ColdEmails coldEmailers={coldEmailers} baseUrl={baseUrl} />

            <Section className="border-t border-solid border-[#EFEFEF] px-6 pt-4 text-center text-[13px] leading-5 text-[#848484]">
              <StatsEmailFooter
                baseUrl={baseUrl}
                unsubscribeToken={unsubscribeToken}
              />
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

SummaryEmail.PreviewProps = {
  baseUrl: "https://www.getinboxzero.com",
  periodEnd: new Date("2024-03-20"),
  archivedEmailCount: 8,
  archivedEmails: [
    {
      from: "Updates <updates@example.com>",
      subject: "New product features this week",
      sentAt: new Date("2024-03-20"),
      ruleName: "Marketing",
    },
    {
      from: "Newsletter <newsletter@example.com>",
      subject: "Weekly industry roundup",
      sentAt: new Date("2024-03-19"),
      ruleName: "Newsletter",
    },
    {
      from: "Sales <sales@example.com>",
      subject: "Quick question",
      sentAt: new Date("2024-03-18"),
      ruleName: "Cold Email",
    },
  ],
  coldEmailers: [
    {
      from: "James <james@example.com>",
      subject: "",
      sentAt: new Date("2024-03-15"),
    },
    {
      from: "Matt <matt@example.com>",
      subject: "",
      sentAt: new Date("2024-03-15"),
    },
    {
      from: "Paul <paul@example.com>",
      subject: "",
      sentAt: new Date("2024-03-15"),
    },
  ],
  needsReplyCount: 2,
  awaitingReplyCount: 3,
  needsReply: [
    {
      from: "Sarah Chen <sarah@company.com>",
      subject: "Project Timeline Update",
      sentAt: new Date("2024-03-15"),
    },
    {
      from: "Alex Johnson <alex@startup.io>",
      subject: "Partnership Opportunity",
      sentAt: new Date("2024-03-18"),
    },
  ],
  awaitingReply: [
    {
      from: "Michael Smith <michael@corp.com>",
      subject: "Contract Review",
      sentAt: new Date("2024-03-10"),
    },
    {
      from: "Emma Davis <emma@tech.co>",
      subject: "API Integration Questions",
      sentAt: new Date("2024-03-12"),
    },
  ],
  unsubscribeToken: "123",
} satisfies SummaryEmailProps;

function StatStrip({ stats }: { stats: { value: number; label: string }[] }) {
  return (
    <Section className="pb-8">
      <Section className="rounded-2xl border border-solid border-[#EFEFEF] bg-white">
        <Row>
          {stats.map((stat, index) => (
            <Column
              key={stat.label}
              align="center"
              className="w-1/3 px-3 py-[22px]"
              style={
                index < stats.length - 1
                  ? { borderRight: "1px solid #EFEFEF" }
                  : undefined
              }
            >
              <Text className="m-0 text-center text-[36px] font-medium leading-10 tracking-[-0.02em] text-[#242424]">
                {stat.value}
              </Text>
              <Text className="m-0 pt-1 text-center text-[13px] leading-[18px] text-[#6D6E70]">
                {stat.label}
              </Text>
            </Column>
          ))}
        </Row>
      </Section>
    </Section>
  );
}

function ArchivedEmails({
  archivedEmailCount,
  archivedEmails,
  baseUrl,
}: {
  archivedEmailCount: number;
  archivedEmails: ArchivedEmailItem[];
  baseUrl: string;
}) {
  if (!archivedEmailCount) return null;

  const archivedEmailGroups = groupArchivedEmailsByRule(archivedEmails);
  const hiddenCount = Math.max(archivedEmailCount - archivedEmails.length, 0);

  return (
    <Card
      title="Archived For You"
      badge={`${archivedEmailCount} this week`}
      badgeStyle={BADGES.green}
      description="Emails your rules labeled and moved out of your inbox."
      footnote={
        hiddenCount > 0
          ? `And ${hiddenCount} more archived ${pluralize(hiddenCount, "email")}.`
          : undefined
      }
      cta={{
        href: `${baseUrl}/automation?tab=history`,
        label: "View automation history",
      }}
    >
      {archivedEmailGroups.map((group) => (
        <EmailList
          key={group.ruleName}
          heading={`${group.ruleName} · ${group.emails.length}`}
          emails={group.emails}
        />
      ))}
    </Card>
  );
}

function ReplyTracker({
  needsReplyCount,
  awaitingReplyCount,
  needsActionCount,
  needsReply,
  awaitingReply,
  needsAction,
  baseUrl,
}: {
  needsReplyCount: number;
  awaitingReplyCount: number;
  needsActionCount: number;
  needsReply: EmailItem[];
  awaitingReply: EmailItem[];
  needsAction: EmailItem[];
  baseUrl: string;
}) {
  if (!needsReplyCount && !awaitingReplyCount && !needsActionCount) {
    return null;
  }

  const hiddenNeedsReply = Math.max(needsReplyCount - needsReply.length, 0);
  const hiddenAwaiting = Math.max(awaitingReplyCount - awaitingReply.length, 0);
  const footnote = [
    hiddenNeedsReply > 0
      ? `And ${hiddenNeedsReply} more waiting for your reply.`
      : null,
    hiddenAwaiting > 0 ? `And ${hiddenAwaiting} more awaiting a reply.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Card
      title="Reply Zero"
      badge={`${needsReplyCount} need you`}
      badgeStyle={BADGES.orange}
      description="Conversations still open on either side."
      footnote={footnote || undefined}
      cta={{
        href: `${baseUrl}/reply-tracker`,
        label: "Open Reply Zero",
        primary: true,
      }}
    >
      <EmailList
        heading={`Waiting for your reply · ${needsReplyCount}`}
        emails={needsReply}
      />
      <EmailList
        heading={`Waiting on them · ${awaitingReplyCount}`}
        emails={awaitingReply}
      />
      {needsActionCount > 0 && (
        <EmailList
          heading={`Needs action · ${needsActionCount}`}
          emails={needsAction}
        />
      )}
    </Card>
  );
}

function ColdEmails({
  coldEmailers,
  baseUrl,
}: {
  coldEmailers: EmailItem[];
  baseUrl: string;
}) {
  if (!coldEmailers.length) return null;

  return (
    <Card
      title="Cold Email Blocker"
      badge={`${coldEmailers.length} blocked`}
      badgeStyle={BADGES.blue}
      description="Unsolicited outreach kept out of your inbox."
      cta={{ href: `${baseUrl}/cold-email-blocker`, label: "View cold emails" }}
    >
      <EmailList emails={coldEmailers} />
    </Card>
  );
}

function Card({
  title,
  badge,
  badgeStyle,
  description,
  footnote,
  cta,
  children,
}: {
  title: string;
  badge: string;
  badgeStyle: (typeof BADGES)[keyof typeof BADGES];
  description: string;
  footnote?: string;
  cta: { href: string; label: string; primary?: boolean };
  children: ReactNode;
}) {
  return (
    <Section className="mb-5 rounded-2xl border border-solid border-[#EFEFEF] bg-white">
      <Section className="px-6 pb-3.5 pt-6">
        <Row>
          <Column>
            <Text className="m-0 text-[20px] font-medium leading-[26px] tracking-[-0.02em] text-[#242424]">
              {title}
            </Text>
          </Column>
          <Column align="right" className="w-[120px]">
            <Text
              className="m-0 inline-block whitespace-nowrap rounded-lg border border-solid px-2.5 py-1 text-[12px] font-semibold leading-4"
              style={{
                backgroundColor: badgeStyle.bg,
                borderColor: badgeStyle.border,
                color: badgeStyle.color,
              }}
            >
              {badge}
            </Text>
          </Column>
        </Row>
        <Text className="m-0 pt-1.5 text-[14px] leading-5 text-[#6D6E70]">
          {description}
        </Text>
      </Section>

      {children}

      {footnote && (
        <Text className="m-0 px-6 pt-3.5 text-[13px] leading-[18px] text-[#848484]">
          {footnote}
        </Text>
      )}

      <Section className="px-6 pb-6 pt-5">
        <Link
          href={cta.href}
          className="block rounded-[10px] px-5 py-3 text-center text-[14px] font-medium leading-5 no-underline"
          style={
            cta.primary
              ? { backgroundColor: ACCENT, color: "#FFFFFF" }
              : { backgroundColor: "#F7F7F7", color: "#242424" }
          }
        >
          {cta.label}
        </Link>
      </Section>
    </Section>
  );
}

function EmailList({
  heading,
  emails,
}: {
  heading?: string;
  emails: EmailItem[];
}) {
  if (emails.length === 0) return null;

  return (
    <>
      {heading && (
        <Text
          className="m-0 px-6 pt-2.5 text-[12px] font-semibold leading-4"
          style={{ color: ACCENT }}
        >
          {heading}
        </Text>
      )}
      <Section className="px-6 pt-2">
        {emails.map((email, index) => (
          <EmailRow
            key={email.from + email.subject}
            email={email}
            isLast={index === emails.length - 1}
          />
        ))}
      </Section>
    </>
  );
}

function EmailRow({ email, isLast }: { email: EmailItem; isLast: boolean }) {
  const { name, address } = splitFrom(email.from);
  const borderClass = `border-t border-solid border-[#EFEFEF] ${
    isLast ? "border-b" : ""
  }`;

  return (
    <Row className={borderClass}>
      <Column className="py-3">
        <Text className="m-0 text-[14px] font-semibold leading-5 text-[#242424]">
          {name}
          {address && (
            <span className="font-normal text-[#848484]"> {address}</span>
          )}
        </Text>
        {email.subject && (
          <Text className="m-0 pt-0.5 text-[14px] leading-5 text-[#3D3D3D]">
            {email.subject}
          </Text>
        )}
      </Column>
      <Column
        align="right"
        className="w-[70px] whitespace-nowrap py-3 align-top"
      >
        <Text className="m-0 text-[13px] leading-5 text-[#848484]">
          {formatDay(email.sentAt)}
        </Text>
      </Column>
    </Row>
  );
}

function groupArchivedEmailsByRule(archivedEmails: ArchivedEmailItem[]) {
  const groups = new Map<string, EmailItem[]>();

  archivedEmails.forEach(({ ruleName, ...email }) => {
    const emails = groups.get(ruleName) || [];
    emails.push(email);
    groups.set(ruleName, emails);
  });

  return Array.from(groups, ([ruleName, emails]) => ({ ruleName, emails }));
}

function splitFrom(from: string) {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match?.[1]) return { name: match[1], address: match[2] };
  return { name: from, address: "" };
}

function formatDay(date: Date) {
  return new Date(date).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

function formatPeriod(end: Date) {
  // Subtract in UTC milliseconds so local DST transitions cannot shift the day.
  const start = new Date(new Date(end).getTime() - 6 * 24 * 60 * 60 * 1000);
  return `${formatDay(start)} to ${formatDay(end)}`;
}

function pluralize(count: number, word: string) {
  return count === 1 ? word : `${word}s`;
}
