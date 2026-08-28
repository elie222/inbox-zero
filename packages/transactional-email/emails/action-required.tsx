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

export type ActionRequiredEmailProps = {
  baseUrl: string;
  email: string;
  unsubscribeToken: string;
  errorType: string;
  errorMessage: string;
  actionUrl: string;
  actionLabel: string;
};

type ActionRequiredEmailComponent = FC<ActionRequiredEmailProps> & {
  PreviewProps: ActionRequiredEmailProps;
};

const ActionRequiredEmail: ActionRequiredEmailComponent = ({
  baseUrl = "https://www.getinboxzero.com",
  email,
  unsubscribeToken,
  errorType,
  errorMessage,
  actionUrl,
  actionLabel,
}: ActionRequiredEmailProps) => {
  const fullActionUrl = actionUrl.startsWith("http")
    ? actionUrl
    : `${baseUrl}${actionUrl}`;

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
                Action Required: {errorType}
              </Text>
            </Section>

            {/* Main Content */}
            <Section className="px-4 pb-4">
              <Text className="text-[16px] text-gray-700 mb-6 mt-0">Hi,</Text>

              <Text className="text-[16px] text-gray-700 mb-6 mt-0">
                We encountered an issue with your Inbox Zero account (
                <strong>{email}</strong>):
              </Text>

              <Text className="text-[16px] text-gray-700 mb-6 mt-0 bg-gray-50 p-4 rounded-lg border border-gray-200">
                {errorMessage}
              </Text>

              <Text className="text-[16px] text-gray-700 mb-8 mt-0">
                Your automated email rules and AI assistant features are paused
                until this is resolved.
              </Text>

              {/* CTA Button */}
              <Section className="text-center mb-8">
                <Button
                  href={fullActionUrl}
                  className="bg-blue-600 text-white px-8 py-4 rounded-[8px] text-[16px] font-semibold no-underline box-border inline-block"
                >
                  {actionLabel}
                </Button>
              </Section>

              <Text className="text-[14px] text-gray-500 mb-8 mt-0">
                If you need help, please visit our support page or reply to this
                email.
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

export default ActionRequiredEmail;

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

ActionRequiredEmail.PreviewProps = {
  baseUrl: "https://www.getinboxzero.com",
  email: "user@example.com",
  unsubscribeToken: "preview-token-123",
  errorType: "API Key Issue",
  errorMessage:
    "Your OpenAI API key is invalid. Please update it in your settings to continue using AI features.",
  actionUrl: "/settings",
  actionLabel: "Update API Key",
};
