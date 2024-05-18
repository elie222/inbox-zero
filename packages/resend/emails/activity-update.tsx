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
} from "@react-email/components";

export interface ActivityUpdateEmailProps {
  baseUrl: string;
  pending: { from: string; subject: string; rule: string }[];
  coldEmailers: { from: string; subject: string }[];
}

export default function ActivityUpdateEmail(props: ActivityUpdateEmailProps) {
  const {
    baseUrl = "https://www.getinboxzero.com",
    pending = [
      {
        from: "James <james@example.com>",
        subject: "Quick catchup",
        rule: "Inbox Zero",
      },
      {
        from: "Matt <matt@example.com>",
        subject: "How are you?",
        rule: "Inbox Zero",
      },
    ],
    coldEmailers = [
      {
        from: "James <james@example.com>",
        subject: "Quick catchup",
      },
      {
        from: "Matt <matt@example.com>",
        subject: "How are you?",
      },
      {
        from: "Paul <paul@example.com>",
        subject: "How are you?",
      },
    ],
  } = props;

  return (
    <Html>
      <Head />
      <Preview>Your weekly Inbox Zero update.</Preview>
      <Tailwind>
        <Body className="bg-white my-auto mx-auto font-sans">
          <Container className="border border-solid border-[#eaeaea] rounded my-[40px] mx-auto p-[20px] w-[465px]">
            <Section className="mt-8">
              <Link href={baseUrl} className="text-[15px]">
                <Img
                  src={`https://www.getinboxzero.com/icon.png`}
                  width="40"
                  height="40"
                  alt="Inbox Zero"
                  className="mx-auto my-0"
                />
              </Link>
            </Section>

            <Section>
              <Text className="text-[24px] font-semibold pt-8">
                Your weekly Inbox Zero update
              </Text>

              <Text style={paragraph}>
                You have {pending.length} {pluralize(pending.length, "email")}{" "}
                from your AI assistant pending approval:
              </Text>

              <ul>
                {pending.map((email) => (
                  <li key={email.from + email.subject}>
                    <Text style={paragraph}>
                      <Text style={paragraph}>
                        <strong>{email.from}</strong>
                      </Text>
                      <Text>{email.subject}</Text>
                      <Text>Rule: {email.rule}</Text>
                    </Text>
                  </li>
                ))}
              </ul>

              <Section className="text-center mt-[32px] mb-[32px]">
                <Button
                  href={`${baseUrl}/automation?tab=pending`}
                  style={{
                    background: "#000",
                    color: "#fff",
                    padding: "12px 20px",
                    borderRadius: "5px",
                  }}
                >
                  View Pending Emails
                </Button>
              </Section>

              <Text style={paragraph}>
                You received {coldEmailers.length}{" "}
                {pluralize(coldEmailers.length, "cold email")} this week:
              </Text>

              <ul>
                {coldEmailers.map((coldEmailer) => (
                  <li key={coldEmailer.from + coldEmailer.subject}>
                    <Text style={paragraph}>
                      <strong>{coldEmailer.from}</strong>
                    </Text>
                    <Text>{coldEmailer.subject}</Text>
                  </li>
                ))}
              </ul>
            </Section>

            <Section className="text-center mt-[32px] mb-[32px]">
              <Button
                href={`${baseUrl}/cold-email-blocker`}
                style={{
                  background: "#000",
                  color: "#fff",
                  padding: "12px 20px",
                  borderRadius: "5px",
                }}
              >
                View Cold Emails
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

function pluralize(count: number, word: string) {
  return count === 1 ? word : `${word}s`;
}
