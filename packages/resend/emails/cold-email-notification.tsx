import {
  Body,
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

export type ColdEmailNotificationProps = {
  baseUrl: string;
};

type ColdEmailNotificationComponent = FC<ColdEmailNotificationProps> & {
  PreviewProps: ColdEmailNotificationProps;
};

const ColdEmailNotification: ColdEmailNotificationComponent = ({
  baseUrl = "https://www.getinboxzero.com",
}: ColdEmailNotificationProps) => {
  return (
    <Html>
      <Head />
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
            </Section>

            <Section className="px-8 pb-8">
              <Text className="text-[16px] text-gray-700 mb-4 mt-0">
                The recipient uses{" "}
                <Link href={baseUrl} className="text-blue-600 underline">
                  Inbox Zero
                </Link>{" "}
                to automatically detect and filter cold emails from first-time
                senders.
              </Text>
              <Text className="text-[16px] text-gray-700 mb-4 mt-0">
                Your email was identified as unsolicited outreach and has been
                filtered.
              </Text>
              <Text className="text-[16px] text-gray-700 mb-0 mt-0">
                If this was sent in error or you need to reach them, please try
                an alternative contact method.
              </Text>
            </Section>

            <Hr className="border-solid border-gray-200 my-6" />
            <Section className="mt-4 mb-8 text-center text-sm text-gray-500">
              <Text className="m-0">
                This is an automated message from{" "}
                <Link href={baseUrl} className="text-blue-600 underline">
                  Inbox Zero
                </Link>
                .
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default ColdEmailNotification;

ColdEmailNotification.PreviewProps = {
  baseUrl: "https://www.getinboxzero.com",
};
