import { Card, CardContent } from "@/components/new-landing/common/Card";
import { CardWrapper } from "@/components/new-landing/common/CardWrapper";
import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import {
  Paragraph,
  SectionHeading,
  SectionSubtitle,
} from "@/components/new-landing/common/Typography";
import { cn } from "@/utils";
import Image from "next/image";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";

type Award = {
  title: MessageDescriptor;
  description: MessageDescriptor;
  image: string;
  imageSize?: number;
  top?: string;
  hideOnMobile?: boolean;
};

const awards: Award[] = [
  {
    title: msg`SOC2 Compliant`,
    description: msg`Enterprise-grade security. SOC 2 Type 2 certified`,
    image: "/images/new-landing/awards/soc-award.png",
  },
  {
    title: msg`#1 GitHub Trending`,
    description: msg`Trusted and loved by developers worldwide`,
    image: "/images/new-landing/awards/github-trending-award.png",
    imageSize: 160,
    top: "top-2",
    hideOnMobile: true,
  },
  {
    title: msg`#1 Product Hunt`,
    description: msg`Product of the Day on Product Hunt`,
    image: "/images/new-landing/awards/product-hunt-award.png",
    imageSize: 170,
  },
  {
    title: msg`12k+ GitHub Stars`,
    description: msg`Open-source. See exactly what the code does`,
    image: "/images/new-landing/awards/github-stars-award.png",
    imageSize: 170,
    top: "top-3",
  },
];

const defaultAwardImageSize = 200;

export function Awards() {
  const { i18n } = useLingui();

  return (
    <Section>
      <SectionHeading>
        <Trans>Privacy first and open source</Trans>
      </SectionHeading>
      <SectionSubtitle>
        <Trans>
          Your data stays private — no AI training, no funny business. We’re
          fully certified for top-tier security, and you can even self-host
          Inbox Zero if you want total control.
        </Trans>
      </SectionSubtitle>
      <SectionContent
        noMarginTop
        className="mt-20 gap-x-5 gap-y-20 lg:gap-y-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
      >
        {awards.map((award) => (
          <CardWrapper
            padding="sm"
            rounded="sm"
            key={award.image}
            className={cn(award.hideOnMobile && "hidden md:block")}
          >
            <Card
              variant="extra-rounding"
              className="gap-3 h-full relative pt-24 text-center"
            >
              <CardContent>
                <Image
                  className={cn(
                    "absolute left-1/2 -translate-x-1/2 -translate-y-20",
                    award.top || "top-0",
                  )}
                  src={award.image}
                  alt={i18n._(award.title)}
                  width={award.imageSize || defaultAwardImageSize}
                  height={award.imageSize || defaultAwardImageSize}
                />
                <Paragraph color="gray-900" size="md" className="font-bold">
                  {i18n._(award.title)}
                </Paragraph>
                <Paragraph size="sm" className="mt-4">
                  {i18n._(award.description)}
                </Paragraph>
              </CardContent>
            </Card>
          </CardWrapper>
        ))}
      </SectionContent>
    </Section>
  );
}
