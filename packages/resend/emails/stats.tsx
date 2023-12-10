import {
  Button,
  Text,
  Html,
  Head,
  Preview,
  Tailwind,
  Body,
  Container,
  Link,
  Section,
  Img,
  Heading,
} from "@react-email/components";

export interface StatsUpdateEmailProps {
  baseUrl: string;
  userEmail: string;
  received: number;
  receivedPercentageDifference: number | null;
  archived: number;
  read: number;
  archiveRate: number;
  readRate: number;
  sent: number;
  sentPercentageDifference: number | null;
  newSenders: { from: string }[];
}

export default function StatsUpdateEmail(props: StatsUpdateEmailProps) {
  const {
    baseUrl = "https://www.getinboxzero.com",
    userEmail = "hello@example.com",
    received = 112,
    receivedPercentageDifference = 12,
    archived = 89,
    read = 55,
    archiveRate = 82,
    readRate = 22,
    sent = 45,
    sentPercentageDifference = -5,
    newSenders = [
      {
        from: "James <james@example.com>",
      },
      {
        from: "Matt <matt@example.com>",
      },
      {
        from: "Paul <paul@example.com>",
      },
    ],
  } = props;

  return (
    <Html>
      <Head />
      <Preview>Your weekly email stats from Inbox Zero.</Preview>
      <Tailwind>
        <Body className="bg-white my-auto mx-auto font-sans">
          <Container className="border border-solid border-[#eaeaea] rounded my-[40px] mx-auto p-[20px] w-[465px]">
            <Section className="mt-8">
              <Link href={baseUrl} className="text-[15px]">
                <Img
                  src={`${baseUrl}/icon.png`}
                  width="40"
                  height="40"
                  alt="Inbox Zero"
                  className="mx-auto my-0"
                />
              </Link>
            </Section>

            <Section>
              <Heading className="text-black text-[24px] font-normal text-center p-0 my-[30px] mx-0 text-center">
                Your weekly email stats from Inbox Zero
              </Heading>

              <Text style={paragraph}>
                Here are your weekly email stats from Inbox Zero!
              </Text>

              <Text style={paragraph}>
                You received {received} emails.{" "}
                {typeof receivedPercentageDifference === "number" && (
                  <>
                    That's {receivedPercentageDifference >= 0 ? "up" : "down"}{" "}
                    {receivedPercentageDifference.toFixed(1)}% from last week.
                  </>
                )}
              </Text>
              <Text style={paragraph}>
                You archived {archived} emails and read {read} emails.
              </Text>
              <Text style={paragraph}>
                Your archive rate is {archiveRate.toFixed(1)}%. Your read rate
                is {readRate.toFixed(1)}%.
              </Text>
              <Text style={paragraph}>
                You sent {sent} emails this week.{" "}
                {typeof sentPercentageDifference === "number" && (
                  <>
                    That's {sentPercentageDifference >= 0 ? "up" : "down"}{" "}
                    {sentPercentageDifference.toFixed(1)}% from last week.
                  </>
                )}
              </Text>

              <Text style={paragraph}>
                You received emails from {newSenders.length} new senders this
                week:
              </Text>
            </Section>

            <ul>
              {newSenders.map((sender) => (
                <li key={sender.from}>
                  <Text style={paragraph}>
                    {sender.from}{" "}
                    <Link
                      href={`https://mail.google.com/mail/u/${userEmail}/#advanced-search/from=${encodeURIComponent(
                        sender.from,
                      )}`}
                    >
                      View
                    </Link>
                  </Text>
                </li>
              ))}
            </ul>

            <Section className="text-center mt-[32px] mb-[32px]">
              <Button
                href={`${baseUrl}stats`}
                style={{
                  background: "#000",
                  color: "#fff",
                  padding: "12px 20px",
                  borderRadius: "5px",
                }}
              >
                View Full Stats
              </Button>
            </Section>

            <Section>
              <Text>
                You're receiving this email because you're subscribed to Inbox
                Zero stats updates. You can change this in your{" "}
                <Link
                  href={`${baseUrl}/settings#email-updates`}
                  className="text-[15px]"
                >
                  settings
                </Link>
                .
              </Text>

              <Link
                href={`${baseUrl}/settings#email-updates`}
                className="text-[15px]"
              >
                Unsubscribe from emails like this
              </Link>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

const paragraph = {
  fontSize: "15px",
  lineHeight: "21px",
  color: "#3c3f44",
};
