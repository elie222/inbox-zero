import {
  Body,
  Column,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import { StatsEmailFooter } from "./components/stats-email-footer";

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

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const ACCENT = "#2563EB";

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
    <Html lang="en">
      <Head />
      <Preview>
        We found {senderCountText} you rarely read. Clean them up in one click.
      </Preview>
      <Tailwind>
        <Body className="m-0 bg-[#FDFDFD] p-0" style={{ fontFamily: FONT }}>
          <Container className="mx-auto w-full max-w-[600px] px-3 pb-12 pt-10">
            <Section className="pb-9 text-center">
              <Link href={baseUrl}>
                <Img
                  src={`${baseUrl}/logo-wordmark.png`}
                  width="209"
                  height="25"
                  alt="Inbox Zero"
                  className="mx-auto my-0"
                />
              </Link>
            </Section>

            <Section className="px-2 pb-7">
              <Text
                className="m-0 pb-2.5 text-[13px] font-semibold leading-[18px]"
                style={{ color: ACCENT }}
              >
                Inbox Health
              </Text>
              <Text className="m-0 pb-3 text-[34px] font-medium leading-10 tracking-[-0.02em] text-[#242424]">
                We found {senderCountText} you rarely read
              </Text>
              <Text className="m-0 text-[16px] leading-6 text-[#6D6E70]">
                Unsubscribing from them could save you around{" "}
                <span className="font-semibold text-[#242424]">
                  {yearlyEmailsAvoided.toLocaleString("en-US")} emails
                </span>{" "}
                a year.
              </Text>
            </Section>

            <Section className="mb-5 rounded-2xl border border-solid border-[#EFEFEF] bg-white">
              <Section className="px-6 pb-3.5 pt-6">
                <Text className="m-0 text-[20px] font-medium leading-[26px] tracking-[-0.02em] text-[#242424]">
                  Rarely read senders
                </Text>
                <Text className="m-0 pt-1.5 text-[14px] leading-5 text-[#6D6E70]">
                  Based on the last 3 months of your inbox.
                </Text>
              </Section>

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

              {hiddenCount > 0 && (
                <Text className="m-0 px-6 pt-3.5 text-[13px] leading-[18px] text-[#848484]">
                  And {hiddenCount} more{" "}
                  {hiddenCount === 1 ? "sender" : "senders"}.
                </Text>
              )}

              <Section className="px-6 pb-6 pt-5">
                <Link
                  href={bulkUnsubscribeUrl}
                  className="block rounded-[10px] px-5 py-3 text-center text-[14px] font-medium leading-5 no-underline"
                  style={{ backgroundColor: ACCENT, color: "#FFFFFF" }}
                >
                  Unsubscribe in one click
                </Link>
              </Section>
            </Section>

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
