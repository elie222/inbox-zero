import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

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

  return (
    <Html>
      <Head />
      <Preview>
        We found {suggestionCount.toString()} senders you rarely read. Clean
        them up in one click.
      </Preview>
      <Tailwind>
        <Body className="bg-white font-sans">
          <Container className="mx-auto w-full max-w-[600px] p-0">
            <Section className="p-8 text-center">
              <Link href={baseUrl} className="text-[15px]">
                <Img
                  src={"https://www.getinboxzero.com/icon.png"}
                  width="40"
                  height="40"
                  alt="Inbox Zero"
                  className="mx-auto my-0"
                />
              </Link>

              <Text className="mx-0 mb-8 mt-4 p-0 text-center text-2xl font-normal">
                <span className="font-semibold tracking-tighter">
                  Inbox Zero
                </span>
              </Text>

              <Heading className="my-4 text-4xl font-medium leading-tight">
                We found {suggestionCount} senders you rarely read
              </Heading>
              <Text className="mb-8 text-lg leading-8">
                Unsubscribing from them could save you around{" "}
                <span className="font-semibold">
                  {yearlyEmailsAvoided.toLocaleString("en-US")} emails
                </span>{" "}
                a year.
              </Text>
            </Section>

            <Section className="rounded-2xl bg-[#3b82f6]/5 bg-[radial-gradient(circle_at_bottom_right,#3b82f6_0%,transparent_60%)] p-8 text-center">
              <Heading className="m-0 text-3xl font-medium text-[#1e40af]">
                Rarely Read Senders
              </Heading>
              <Text className="mb-4 text-gray-900">
                Based on the last 3 months of your inbox
              </Text>

              {senders.map((sender) => (
                <SenderCard key={sender.email} sender={sender} />
              ))}

              <Section className="text-center mt-[32px] mb-[32px]">
                <Button
                  href={bulkUnsubscribeUrl}
                  style={{
                    background: "#000",
                    color: "#fff",
                    padding: "12px 20px",
                    borderRadius: "5px",
                  }}
                >
                  Unsubscribe in One Click
                </Button>
              </Section>
            </Section>

            <Footer baseUrl={baseUrl} unsubscribeToken={unsubscribeToken} />
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

function SenderCard({ sender }: { sender: SuggestedSender }) {
  return (
    <Section className="my-3 rounded-lg bg-white/50 p-4 text-left shadow-sm border border-[#3b82f6]/20">
      <Row>
        <Column>
          <Text className="m-0 font-semibold">
            {sender.name || sender.email}
          </Text>
          <Text className="m-0 text-gray-600">{sender.email}</Text>
        </Column>
        <Column align="right">
          <Text className="m-0 text-sm text-gray-500">
            {sender.count} emails in the last 3 months
          </Text>
          <Text className="m-0 text-sm text-gray-500">
            {sender.readPercentage}% read
          </Text>
        </Column>
      </Row>
    </Section>
  );
}

function Footer({
  baseUrl,
  unsubscribeToken,
}: {
  baseUrl: string;
  unsubscribeToken: string;
}) {
  return (
    <Section>
      <Text>
        You're receiving this email because you're subscribed to Inbox Zero
        stats updates. You can change this in your{" "}
        <Link
          href={`${baseUrl}/settings#email-updates`}
          className="text-[15px]"
        >
          settings
        </Link>
        .
      </Text>

      <Link
        href={`${baseUrl}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`}
        className="text-[15px]"
      >
        Unsubscribe from emails like this
      </Link>
    </Section>
  );
}
