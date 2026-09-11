import type { Metadata } from "next";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import {
  PageHeading,
  Paragraph,
} from "@/components/new-landing/common/Typography";
import { BlurFade } from "@/components/new-landing/common/BlurFade";
import { StoreBadges } from "@/app/(landing)/app/StoreBadges";
import { BRAND_NAME, getBrandTitle } from "@/utils/branding";

export const metadata: Metadata = {
  title: getBrandTitle("Get the app"),
  description: `${BRAND_NAME} on iPhone and Android. Organize your inbox, draft replies, and reach inbox zero from anywhere.`,
  alternates: { canonical: "/app" },
};

export default function AppPage() {
  return (
    <BasicLayout>
      <Section className="mt-10 md:mt-20">
        <PageHeading>{BRAND_NAME} on your phone</PageHeading>
        <BlurFade duration={0.4} delay={0.125 * 2}>
          <Paragraph size="lg" className="mx-auto mt-6 max-w-[640px]">
            Your AI email assistant, now on iPhone and Android. Organize your
            inbox, draft replies in your voice, and reach inbox zero from
            anywhere.
          </Paragraph>
        </BlurFade>
        <SectionContent className="mt-8 md:mt-10">
          <BlurFade duration={0.4} delay={0.125 * 4}>
            <StoreBadges />
          </BlurFade>
          <BlurFade duration={0.4} delay={0.125 * 5}>
            <Paragraph color="light" size="sm" className="mt-5">
              Free to download.
            </Paragraph>
          </BlurFade>
        </SectionContent>
      </Section>
    </BasicLayout>
  );
}
