import Image from "next/image";
import Link from "next/link";
import { Gift, Repeat, Zap } from "lucide-react";
import { HeroVideoDialog } from "@/app/(landing)/home/HeroVideoDialog";
import { BlurFade } from "@/components/new-landing/common/BlurFade";
import { Button } from "@/components/new-landing/common/Button";
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
import { tiers } from "@/app/(app)/premium/config";
import { MAIL_CLIENT_SIGNUP_PATH } from "@/utils/config";

export const EMAIL_CLIENT_SECTION_ID = "email-client";

const LAUNCH_VIDEO = {
  playbackId: "1K01tCypmkqhB3OZwCzO9j0202K0089aqXX02tYpgoUzztmc",
  title: "Meet the Inbox Zero email app",
  thumbnailTime: 1.5,
};

const reasons = [
  {
    icon: <Gift className="size-5" />,
    title: "Free to use",
    description: "The app is free. Add the AI only if you want it.",
  },
  {
    icon: <Repeat className="size-5" />,
    title: "No need to switch",
    description: "Prefer Gmail or Outlook? The AI works there too.",
  },
  {
    icon: <Zap className="size-5" />,
    title: "Half the price of Superhuman",
    description: `AI drafts and a sorted inbox from $${tiers[0].price.annually}/month, half what Superhuman charges.`,
  },
];

export function EmailClient() {
  return (
    <Section id={EMAIL_CLIENT_SECTION_ID}>
      <SectionHeading>Fly through email on desktop and mobile</SectionHeading>
      <SectionSubtitle>
        Every Gmail and Outlook account in one inbox, on the web, Mac, Windows,
        and iPhone. Like Superhuman, but free.
      </SectionSubtitle>
      <SectionContent>
        <BlurFade inView>
          <div className="relative overflow-hidden rounded-3xl border border-[#EFEFEF] md:rounded-[43px]">
            <HeroVideoDialog
              playbackId={LAUNCH_VIDEO.playbackId}
              thumbnailTime={LAUNCH_VIDEO.thumbnailTime}
              title={LAUNCH_VIDEO.title}
            />
            <Image
              src={`https://image.mux.com/${LAUNCH_VIDEO.playbackId}/thumbnail.jpg?time=${LAUNCH_VIDEO.thumbnailTime}&width=1920`}
              alt={LAUNCH_VIDEO.title}
              width={1920}
              height={1080}
              sizes="(min-width: 1280px) 1152px, (min-width: 1024px) calc(100vw - 64px), calc(100vw - 48px)"
              className="h-auto w-full"
            />
          </div>
        </BlurFade>
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          {reasons.map((reason) => (
            <CardWrapper key={reason.title}>
              <Card variant="extra-rounding" className="h-full">
                <CardContent className="text-left">
                  <div className="mb-3 text-blue-500">{reason.icon}</div>
                  <Paragraph color="gray-900" className="font-semibold">
                    {reason.title}
                  </Paragraph>
                  <Paragraph size="sm" className="mt-1">
                    {reason.description}
                  </Paragraph>
                </CardContent>
              </Card>
            </CardWrapper>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Button size="lg" asChild>
            <Link href={MAIL_CLIENT_SIGNUP_PATH}>
              <span className="relative z-10">Try the email app free</span>
            </Link>
          </Button>
        </div>
      </SectionContent>
    </Section>
  );
}
