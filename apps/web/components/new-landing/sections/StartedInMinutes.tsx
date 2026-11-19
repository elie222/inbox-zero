import { Badge } from "@/components/new-landing/common/Badge";
import { BlurFade } from "@/components/new-landing/common/BlurFade";
import { Card } from "@/components/new-landing/common/Card";
import { CardWrapper } from "@/components/new-landing/common/CardWrapper";
import { DisplayCard } from "@/components/new-landing/common/DisplayCard";
import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import {
  SectionHeading,
  SectionSubtitle,
} from "@/components/new-landing/common/Typography";
import { AutoOrganize } from "@/components/new-landing/icons/AutoOrganize";
import { Bell } from "@/components/new-landing/icons/Bell";
import { Calendar } from "@/components/new-landing/icons/Calendar";
import { Connect } from "@/components/new-landing/icons/Connect";
import { Envelope } from "@/components/new-landing/icons/Envelope";
import { Fire } from "@/components/new-landing/icons/Fire";
import { Gmail } from "@/components/new-landing/icons/Gmail";
import { Megaphone } from "@/components/new-landing/icons/Megaphone";
import { Newsletter } from "@/components/new-landing/icons/Newsletter";
import { Outlook } from "@/components/new-landing/icons/Outlook";
import { SnowFlake } from "@/components/new-landing/icons/SnowFlake";
import { SparkleBlue } from "@/components/new-landing/icons/SparkleBlue";
import { Team } from "@/components/new-landing/icons/Team";
import Image from "next/image";
import { Trans, useLingui } from "@lingui/react/macro";

interface StartedInMinutesProps {
  subtitle: React.ReactNode;
  title: React.ReactNode;
}

export function StartedInMinutes({ title, subtitle }: StartedInMinutesProps) {
  const { t } = useLingui();

  return (
    <Section>
      <SectionHeading>{title}</SectionHeading>
      <SectionSubtitle>{subtitle}</SectionSubtitle>
      <SectionContent className="sm:mx-10 md:mx-40 lg:mx-0">
        <CardWrapper className="w-full grid grid-cols-1 lg:grid-cols-3 gap-5">
          <BlurFade inView>
            <DisplayCard
              title={t`Connect your Google or Microsoft email`}
              description={t`Link your Gmail or Outlook in two clicks to get started.`}
              icon={
                <Badge variant="dark-gray" size="sm" icon={<Connect />}>
                  <Trans>STEP 1</Trans>
                </Badge>
              }
              centerContent={true}
              className="h-full"
            >
              <div className="flex gap-4">
                <CardWrapper padding="xs-2" rounded="full">
                  <Card variant="circle">
                    <div className="p-2 translate-y-1">
                      <Gmail width="64" height="64" />
                    </div>
                  </Card>
                </CardWrapper>
                <CardWrapper padding="xs-2" rounded="full">
                  <Card variant="circle">
                    <div className="p-2 translate-y-1">
                      <Outlook width="64" height="64" />
                    </div>
                  </Card>
                </CardWrapper>
              </div>
            </DisplayCard>
          </BlurFade>
          <BlurFade delay={0.25} inView>
            <DisplayCard
              title={t`Organizes your inbox exactly how you want it`}
              description={t`Smart categories set up automatically. Use our categories or create your own.`}
              icon={
                <Badge variant="dark-gray" size="sm" icon={<AutoOrganize />}>
                  <Trans>STEP 2</Trans>
                </Badge>
              }
              centerContent
              className="h-full"
            >
              <div className="flex flex-col gap-2 scale-[110%]">
                <div className="flex gap-2">
                  <Badge variant="purple" icon={<Newsletter />}>
                    <Trans>Newsletter</Trans>
                  </Badge>
                  <Badge variant="dark-blue" icon={<Envelope />}>
                    <Trans>To Reply</Trans>
                  </Badge>
                  <Badge variant="green" icon={<Megaphone />}>
                    <Trans>Marketing</Trans>
                  </Badge>
                  <Badge variant="yellow" icon={<Calendar />}>
                    <Trans>Calendar</Trans>
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Badge variant="red" icon={<Bell />}>
                    <Trans>Notification</Trans>
                  </Badge>
                  <Badge variant="light-blue" icon={<SnowFlake />}>
                    <Trans>Cold Email</Trans>
                  </Badge>
                  <Badge variant="orange" icon={<Team />}>
                    <Trans>Team</Trans>
                  </Badge>
                  <Badge variant="pink" icon={<Fire />}>
                    <Trans>Urgent</Trans>
                  </Badge>
                </div>
              </div>
            </DisplayCard>
          </BlurFade>
          <BlurFade delay={0.25 * 2} inView>
            <DisplayCard
              title={t`Pre-drafted replies based on your email history and calendar`}
              description={t`Every email you get needing a reply will have a pre-written draft.`}
              icon={
                <Badge variant="dark-gray" size="sm" icon={<SparkleBlue />}>
                  <Trans>STEP 3</Trans>
                </Badge>
              }
            >
              <div className="pt-6 pl-6">
                <Image
                  src="/images/new-landing/new-message.png"
                  alt={t`Pre-drafted replies`}
                  width={1407}
                  height={852}
                  sizes="(min-width: 1280px) 333px, (min-width: 1152px) 312px, (min-width: 1024px) calc(33.333vw - 72px), (min-width: 768px) calc(100vw - 432px), (min-width: 640px) calc(100vw - 192px), calc(100vw - 112px)"
                  className="h-auto w-full"
                />
              </div>
            </DisplayCard>
          </BlurFade>
        </CardWrapper>
      </SectionContent>
    </Section>
  );
}
