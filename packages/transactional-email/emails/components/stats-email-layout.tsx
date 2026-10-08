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
import type { ReactNode } from "react";
import { StatsEmailFooter } from "./stats-email-footer";

export const ACCENT = "#2563EB";

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

export function StatsEmailLayout({
  baseUrl,
  unsubscribeToken,
  preview,
  eyebrow,
  title,
  subtitle,
  children,
}: {
  baseUrl: string;
  unsubscribeToken: string;
  preview: string;
  eyebrow: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  children: ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
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
                {eyebrow}
              </Text>
              <Text className="m-0 pb-3 text-[34px] font-medium leading-10 tracking-[-0.02em] text-[#242424]">
                {title}
              </Text>
              <Text className="m-0 text-[16px] leading-6 text-[#6D6E70]">
                {subtitle}
              </Text>
            </Section>

            {children}

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

export function StatsEmailCard({
  title,
  badge,
  description,
  footnote,
  cta,
  children,
}: {
  title: string;
  badge?: { label: string; bg: string; border: string; color: string };
  description: string;
  footnote?: string;
  cta: { href: string; label: string; primary?: boolean };
  children: ReactNode;
}) {
  return (
    <Section className="mb-5 rounded-2xl border border-solid border-[#EFEFEF] bg-white">
      <Section className="px-6 pb-3.5 pt-6">
        <Row>
          <Column>
            <Text className="m-0 text-[20px] font-medium leading-[26px] tracking-[-0.02em] text-[#242424]">
              {title}
            </Text>
          </Column>
          {badge && (
            <Column align="right" className="w-[120px]">
              <Text
                className="m-0 inline-block whitespace-nowrap rounded-lg border border-solid px-2.5 py-1 text-[12px] font-semibold leading-4"
                style={{
                  backgroundColor: badge.bg,
                  borderColor: badge.border,
                  color: badge.color,
                }}
              >
                {badge.label}
              </Text>
            </Column>
          )}
        </Row>
        <Text className="m-0 pt-1.5 text-[14px] leading-5 text-[#6D6E70]">
          {description}
        </Text>
      </Section>

      {children}

      {footnote && (
        <Text className="m-0 px-6 pt-3.5 text-[13px] leading-[18px] text-[#848484]">
          {footnote}
        </Text>
      )}

      <Section className="px-6 pb-6 pt-5">
        <Link
          href={cta.href}
          className="block rounded-[10px] px-5 py-3 text-center text-[14px] font-medium leading-5 no-underline"
          style={
            cta.primary
              ? { backgroundColor: ACCENT, color: "#FFFFFF" }
              : { backgroundColor: "#F7F7F7", color: "#242424" }
          }
        >
          {cta.label}
        </Link>
      </Section>
    </Section>
  );
}
