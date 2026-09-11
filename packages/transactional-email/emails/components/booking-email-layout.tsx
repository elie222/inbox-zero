import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";
import { InboxZeroFooter } from "./inbox-zero-footer";

export function BookingEmailLayout({
  headline,
  subline,
  children,
}: {
  headline: ReactNode;
  subline: ReactNode;
  children: ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Tailwind>
        <Body className="bg-[#EDEEF1] font-sans">
          <Container className="mx-auto my-7 w-full max-w-[600px] overflow-hidden rounded-2xl border border-[#E1E3E8] bg-white">
            <Section className="px-8 pb-3 pt-6">
              <Heading
                as="h1"
                className="m-0 text-[18px] font-medium tracking-tight text-gray-900"
              >
                {headline}
              </Heading>
              <Text className="m-0 mt-1 text-[13px] text-gray-500">
                {subline}
              </Text>
            </Section>

            <Section className="px-8 pb-6 pt-2">{children}</Section>

            <InboxZeroFooter />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
