import { Column, Link, Row, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";
import {
  StatsEmailCard,
  StatsEmailLayout,
} from "./components/stats-email-layout";

type EmailItem = {
  from: string;
  subject: string;
  sentAt: Date;
  url?: string;
  senderUrl?: string;
  notColdUrl?: string;
};

type ArchivedEmailItem = EmailItem & {
  ruleName: string;
};

export interface SummaryEmailProps {
  archivedEmailCount?: number;
  archivedEmails?: ArchivedEmailItem[];
  baseUrl: string;
  coldEmailCount?: number;
  coldEmailers: EmailItem[];
  emailAccountId: string;
  // End of the week being summarized. Defaults to now.
  periodEnd?: Date;
  unsubscribeToken: string;
}

const MAX_SUBJECTS_PER_SENDER = 3;

export default function SummaryEmail(props: SummaryEmailProps) {
  const {
    baseUrl = "https://www.getinboxzero.com",
    archivedEmailCount = 0,
    archivedEmails = [],
    coldEmailers,
    coldEmailCount = coldEmailers.length,
    emailAccountId,
    periodEnd = new Date(),
    unsubscribeToken,
  } = props;

  const archiveTitle = `${archivedEmailCount} ${pluralize(archivedEmailCount, "email")} archived`;
  const coldTitle = `${coldEmailCount} cold ${pluralize(coldEmailCount, "email")} flagged`;
  const preview = [
    archivedEmailCount ? archiveTitle : "",
    coldEmailCount ? coldTitle : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const accountUrl = new URL(`/${encodeURIComponent(emailAccountId)}`, baseUrl)
    .href;

  return (
    <StatsEmailLayout
      baseUrl={baseUrl}
      unsubscribeToken={unsubscribeToken}
      preview={preview || "Your week in email"}
      eyebrow={<>Weekly Update &middot; {formatPeriod(periodEnd)}</>}
      title="Your week in email"
      subtitle="Here's how your assistant handled your inbox this week."
    >
      <ArchivedEmails
        title={archiveTitle}
        archivedEmailCount={archivedEmailCount}
        archivedEmails={archivedEmails}
        accountUrl={accountUrl}
      />

      <ColdEmails
        title={coldTitle}
        coldEmailCount={coldEmailCount}
        coldEmailers={coldEmailers}
        accountUrl={accountUrl}
      />
    </StatsEmailLayout>
  );
}

SummaryEmail.PreviewProps = {
  baseUrl: "https://www.getinboxzero.com",
  emailAccountId: "example-account",
  periodEnd: new Date("2024-03-20"),
  archivedEmailCount: 8,
  archivedEmails: [
    {
      from: "Updates <updates@example.com>",
      subject: "New product features this week",
      url: "https://www.getinboxzero.com/example-account/mail?thread-id=update-1",
      senderUrl:
        "https://www.getinboxzero.com/example-account/mail?q=from%3Aupdates%40example.com",
      sentAt: new Date("2024-03-20"),
      ruleName: "Marketing",
    },
    {
      from: "Updates <updates@example.com>",
      subject: "Last chance to join our webinar",
      url: "https://www.getinboxzero.com/example-account/mail?thread-id=update-2",
      sentAt: new Date("2024-03-19"),
      ruleName: "Marketing",
    },
    {
      from: "Newsletter <newsletter@example.com>",
      subject: "Weekly industry roundup",
      url: "https://www.getinboxzero.com/example-account/mail?thread-id=newsletter",
      sentAt: new Date("2024-03-19"),
      ruleName: "Newsletter",
    },
  ],
  coldEmailers: [
    {
      from: "James <james@example.com>",
      subject: "Quick question about your website",
      url: "https://www.getinboxzero.com/example-account/mail?thread-id=outreach-1",
      notColdUrl:
        "https://www.getinboxzero.com/example-account/cold-email-blocker?not-cold=flagged-james",
      sentAt: new Date("2024-03-15"),
    },
    {
      from: "Matt <matt@example.com>",
      subject: "Want to reach more customers?",
      url: "https://www.getinboxzero.com/example-account/mail?thread-id=outreach-2",
      notColdUrl:
        "https://www.getinboxzero.com/example-account/cold-email-blocker?not-cold=flagged-matt",
      sentAt: new Date("2024-03-15"),
    },
    {
      from: "Paul <paul@example.com>",
      subject: "",
      url: "https://www.getinboxzero.com/example-account/mail?thread-id=outreach-3",
      notColdUrl:
        "https://www.getinboxzero.com/example-account/cold-email-blocker?not-cold=flagged-paul",
      sentAt: new Date("2024-03-15"),
    },
  ],
  unsubscribeToken: "123",
} satisfies SummaryEmailProps;

function ArchivedEmails({
  title,
  archivedEmailCount,
  archivedEmails,
  accountUrl,
}: {
  title: string;
  archivedEmailCount: number;
  archivedEmails: ArchivedEmailItem[];
  accountUrl: string;
}) {
  if (!archivedEmailCount) return null;

  const archivedEmailGroups = groupArchivedEmailsByRule(archivedEmails);
  const hiddenCount = Math.max(archivedEmailCount - archivedEmails.length, 0);

  return (
    <StatsEmailCard
      title={title}
      description="Moved out of your inbox by your rules."
      footnote={
        archivedEmails.length > 0 && hiddenCount > 0
          ? `And ${hiddenCount} more archived ${pluralize(hiddenCount, "email")}.`
          : undefined
      }
      cta={{
        href: `${accountUrl}/automation?tab=history`,
        label: "View rule activity",
      }}
    >
      {archivedEmailGroups.map((group) => (
        <EmailList
          key={group.ruleName}
          heading={`${group.ruleName} · ${group.emails.length}`}
          emails={group.emails}
        />
      ))}
    </StatsEmailCard>
  );
}

function ColdEmails({
  title,
  coldEmailCount,
  coldEmailers,
  accountUrl,
}: {
  title: string;
  coldEmailCount: number;
  coldEmailers: EmailItem[];
  accountUrl: string;
}) {
  if (!coldEmailCount) return null;

  const hiddenCount = Math.max(coldEmailCount - coldEmailers.length, 0);

  return (
    <StatsEmailCard
      title={title}
      description="If a sender was flagged by mistake, you can mark them as not cold."
      footnote={
        coldEmailers.length > 0 && hiddenCount > 0
          ? `And ${hiddenCount} more cold ${pluralize(hiddenCount, "email")}.`
          : undefined
      }
      cta={{
        href: `${accountUrl}/cold-email-blocker`,
        label: "Review cold emails",
      }}
    >
      <EmailList emails={coldEmailers} />
    </StatsEmailCard>
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

  const senders = groupEmailsBySender(emails);

  return (
    <>
      {heading && (
        <Text className="m-0 px-6 pt-2.5 text-[12px] font-semibold leading-4 text-[#6D6E70]">
          {heading}
        </Text>
      )}
      <Section className="px-6 pt-2">
        {senders.map((sender, index) => (
          <SenderRow
            key={sender.key}
            emails={sender.emails}
            isLast={index === senders.length - 1}
          />
        ))}
      </Section>
    </>
  );
}

function SenderRow({
  emails,
  isLast,
}: {
  emails: EmailItem[];
  isLast: boolean;
}) {
  const [latest] = emails;
  const count = emails.length;
  const { name, address } = splitFrom(latest.from);
  const senderHref = count > 1 ? latest.senderUrl || latest.url : latest.url;
  const shownEmails = emails.slice(0, MAX_SUBJECTS_PER_SENDER);
  const hiddenCount = count - shownEmails.length;
  const borderClass = `border-t border-solid border-[#EFEFEF] ${
    isLast ? "border-b" : ""
  }`;

  const sender = (
    <Text
      className="m-0 text-[14px] font-semibold leading-5 text-[#242424]"
      style={{ overflowWrap: "anywhere" }}
    >
      {name}
      {address && (
        <span className="text-[12px] font-normal text-[#6D6E70]">
          {" "}
          {address}
        </span>
      )}
    </Text>
  );

  return (
    <Row className={borderClass}>
      <Column className="py-3">
        <OptionalLink href={senderHref}>
          {sender}
          {count === 1 && <EmailSubject email={latest} />}
        </OptionalLink>
        {count > 1 &&
          shownEmails.map((email, index) => (
            <OptionalLink key={`${email.subject}-${index}`} href={email.url}>
              <EmailSubject email={email} />
            </OptionalLink>
          ))}
        {hiddenCount > 0 && (
          <OptionalLink href={latest.senderUrl}>
            <Text className="m-0 pt-0.5 text-[13px] leading-5 text-[#848484]">
              +{hiddenCount} more
            </Text>
          </OptionalLink>
        )}
      </Column>
      <Column
        align="right"
        className="w-px whitespace-nowrap py-3 pl-2 align-middle"
      >
        <Text className="m-0 text-[12px] leading-5 text-[#6D6E70]">
          {formatDay(latest.sentAt)}
          {latest.notColdUrl && (
            <RowAction href={latest.notColdUrl}>Mark not cold</RowAction>
          )}
          {senderHref && <RowAction href={senderHref}>View</RowAction>}
        </Text>
      </Column>
    </Row>
  );
}

function EmailSubject({ email }: { email: EmailItem }) {
  if (!email.subject && !email.url) return null;

  return (
    <Text
      className="m-0 pt-0.5 text-[14px] leading-5 text-[#3D3D3D]"
      style={{ overflowWrap: "anywhere" }}
    >
      {email.subject || "(No subject)"}
    </Text>
  );
}

function RowAction({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="ml-1.5 inline-block whitespace-nowrap rounded-md border border-solid border-[#E0E0E0] px-1.5 py-1 align-middle text-[12px] font-medium leading-4 text-[#3D3D3D] no-underline"
    >
      {children}
    </Link>
  );
}

function OptionalLink({
  href,
  children,
}: {
  href?: string;
  children: ReactNode;
}) {
  if (!href) return children;
  return (
    <Link href={href} className="block no-underline">
      {children}
    </Link>
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

// Keeps first-seen order, so the most recent email from each sender leads
// when the input is sorted newest first.
function groupEmailsBySender(emails: EmailItem[]) {
  const groups = new Map<string, EmailItem[]>();

  emails.forEach((email) => {
    const { name, address } = splitFrom(email.from);
    const key = (address || name).toLowerCase();
    const group = groups.get(key) || [];
    group.push(email);
    groups.set(key, group);
  });

  return Array.from(groups, ([key, emails]) => ({ key, emails }));
}

function splitFrom(from: string) {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (!match) return { name: from, address: "" };
  const [, name, address] = match;
  return name ? { name, address } : { name: address, address: "" };
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
