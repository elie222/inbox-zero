import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import type { FC } from "react";

export type ReconnectionEmailProps = {
  baseUrl: string;
  email: string;
  unsubscribeToken: string;
};

type ReconnectionEmailComponent = FC<ReconnectionEmailProps> & {
  PreviewProps: ReconnectionEmailProps;
};

const ReconnectionEmail: ReconnectionEmailComponent = ({
  baseUrl = "https://www.getinboxzero.com",
  email,
  unsubscribeToken,
}: ReconnectionEmailProps) => {
  const reconnectUrl = `${baseUrl}/accounts`;

  return (
    <Html>
      <Head />
      <Tailwind>
        <Body className="bg-white font-sans">
          <Container className="mx-auto w-full max-w-[600px] p-0">
            {/* Header */}
            <Section className="p-4 text-center">
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

              <Text className="mx-0 mb-8 mt-0 p-0 text-center text-2xl font-normal text-gray-900">
                Action Required: Your email account was disconnected
              </Text>
            </Section>

            {/* Main Content */}
            <Section className="px-4 pb-4">
              <Text className="text-[16px] text-gray-700 mb-6 mt-0">Hi,</Text>

              <Text className="text-[16px] text-gray-700 mb-6 mt-0">
                The connection for <strong>{email}</strong> to Inbox Zero was
                disconnected. This usually happens after a password change, if
                access was revoked, or if your 6-month approval period has
                expired.
              </Text>

              <Text className="text-[16px] text-gray-700 mb-8 mt-0">
                Please reconnect your account to resume your automated email
                rules and AI assistant features.
              </Text>

              {/* CTA Button */}
              <Section className="text-center mb-8">
                <Button
                  href={reconnectUrl}
                  className="bg-blue-600 text-white px-8 py-4 rounded-[8px] text-[16px] font-semibold no-underline box-border inline-block"
                >
                  Reconnect Now
                </Button>
              </Section>

              <Text className="text-[14px] text-gray-500 mb-8 mt-0">
                If you didn't expect this, it's likely a security measure from
                your email provider. Reconnecting is safe and only takes a few
                seconds.
              </Text>
            </Section>

            {/* Footer */}
            <Hr className="border-solid border-gray-200 my-6" />
            <Footer baseUrl={baseUrl} unsubscribeToken={unsubscribeToken} />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default ReconnectionEmail;

function Footer({
  baseUrl,
  unsubscribeToken,
}: {
  baseUrl: string;
  unsubscribeToken: string;
}) {
  return (
    <Section className="mt-8 text-center text-sm text-gray-500">
      <Text className="m-0">
        You're receiving this email because your email account is connected to
        Inbox Zero.
      </Text>
      <div className="mt-2">
        <Link
          href={`${baseUrl}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`}
          className="text-gray-500 underline mr-4"
        >
          Unsubscribe
        </Link>
        <Link
          href={`${baseUrl}/support`}
          className="text-gray-500 underline mr-4"
        >
          Support
        </Link>
        <Link href={`${baseUrl}/privacy`} className="text-gray-500 underline">
          Privacy Policy
        </Link>
      </div>
    </Section>
  );
}

ReconnectionEmail.PreviewProps = {
  baseUrl: "https://www.getinboxzero.com",
  email: "user@example.com",
  unsubscribeToken: "preview-token-123",
};
