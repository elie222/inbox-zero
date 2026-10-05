import { Column, Link, Row, Section, Text } from "@react-email/components";
import {
  StatsEmailCard,
  StatsEmailLayout,
} from "./components/stats-email-layout";

type SuggestedSender = {
  name: string;
  email: string;
  count: number;
  readPercentage: number;
};

export interface InboxHealthEmailProps {
  baseUrl: string;
  emailAccountId: string;
  senders: SuggestedSender[];
  suggestionCount: number;
  unsubscribeToken: string;
  yearlyEmailsAvoided: number;
}

export default function InboxHealthEmail(props: InboxHealthEmailProps) {
  const {
    baseUrl = "https://www.getinboxzero.com",
    emailAccountId,
    unsubscribeToken,
    suggestionCount,
    yearlyEmailsAvoided,
    senders,
  } = props;

  const bulkUnsubscribeUrl = `${baseUrl}/${emailAccountId}/bulk-unsubscribe?select=suggested`;
  const senderCountText = getSenderCountText(suggestionCount);
  const hiddenCount = Math.max(suggestionCount - senders.length, 0);

  return (
    <StatsEmailLayout
      baseUrl={baseUrl}
      unsubscribeToken={unsubscribeToken}
      preview={`We found ${senderCountText} you rarely read. Clean them up in one click.`}
      eyebrow="Inbox Health"
      title={`We found ${senderCountText} you rarely read`}
      subtitle={
        <>
          Unsubscribing from them could save you around{" "}
          <span className="font-semibold text-[#242424]">
            {yearlyEmailsAvoided.toLocaleString("en-US")} emails
          </span>{" "}
          a year.
        </>
      }
    >
      <StatsEmailCard
        title="Rarely read senders"
        description="Based on the last 3 months of your inbox."
        footnote={
          hiddenCount > 0
            ? `And ${hiddenCount} more ${hiddenCount === 1 ? "sender" : "senders"}.`
            : undefined
        }
        cta={{
          href: bulkUnsubscribeUrl,
          label: "Unsubscribe in one click",
          primary: true,
        }}
      >
        <Section className="px-6 pt-2">
          {senders.map((sender, index) => (
            <SenderRow
              key={sender.email}
              sender={sender}
              href={bulkUnsubscribeUrl}
              isLast={index === senders.length - 1}
            />
          ))}
        </Section>
      </StatsEmailCard>
    </StatsEmailLayout>
  );
}

InboxHealthEmail.PreviewProps = {
  baseUrl: "https://www.getinboxzero.com",
  emailAccountId: "email-account-id",
  unsubscribeToken: "123",
  suggestionCount: 7,
  yearlyEmailsAvoided: 1248,
  senders: [
    {
      name: "Daily Deals",
      email: "deals@shopping.example.com",
      count: 92,
      readPercentage: 2,
    },
    {
      name: "Tech Newsletter",
      email: "newsletter@technews.example.com",
      count: 64,
      readPercentage: 8,
    },
    {
      name: "Promo Updates",
      email: "promo@retailer.example.com",
      count: 48,
      readPercentage: 0,
    },
    {
      name: "Webinar Invites",
      email: "events@saas.example.com",
      count: 35,
      readPercentage: 11,
    },
    {
      name: "Job Alerts",
      email: "alerts@jobs.example.com",
      count: 26,
      readPercentage: 15,
    },
  ],
} satisfies InboxHealthEmailProps;

// The whole row is a link so mail clients don't auto-link the bare address.
function SenderRow({
  sender,
  href,
  isLast,
}: {
  sender: SuggestedSender;
  href: string;
  isLast: boolean;
}) {
  const showAddress = sender.name && sender.name !== sender.email;
  const borderClass = `border-t border-solid border-[#EFEFEF] ${
    isLast ? "border-b" : ""
  }`;

  return (
    <Row className={borderClass}>
      <Column className="py-3">
        <Link href={href} className="block no-underline">
          <Text className="m-0 text-[14px] font-semibold leading-5 text-[#242424]">
            {sender.name || sender.email}
          </Text>
          {showAddress && (
            <Text className="m-0 pt-0.5 text-[13px] leading-5 text-[#848484]">
              {sender.email}
            </Text>
          )}
        </Link>
      </Column>
      <Column
        align="right"
        className="w-[110px] whitespace-nowrap py-3 align-top"
      >
        <Text className="m-0 text-[14px] font-medium leading-5 text-[#242424]">
          {sender.count.toLocaleString("en-US")} emails
        </Text>
        <Text className="m-0 pt-0.5 text-[13px] leading-5 text-[#848484]">
          {sender.readPercentage}% read
        </Text>
      </Column>
    </Row>
  );
}

export function getSenderCountText(count: number) {
  return `${count} ${count === 1 ? "sender" : "senders"}`;
}
