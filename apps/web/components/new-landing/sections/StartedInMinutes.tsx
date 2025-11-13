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

export function StartedInMinutes() {
  return (
    <Section>
      <SectionHeading>Get started in minutes</SectionHeading>
      <SectionSubtitle>
        One-click setup. Start organizing and drafting replies in minutes.
      </SectionSubtitle>
      <SectionContent>
        <CardWrapper className="w-full grid grid-cols-1 md:grid-cols-3 gap-5">
          <BlurFade inView>
            <DisplayCard
              title="Connect your Google or Microsoft email"
              description="Link your Gmail or Outlook in two clicks to get started."
              icon={
                <Badge variant="dark-gray" size="sm" icon={<Connect />}>
                  STEP 1
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
              title="Organizes your inbox exactly how you want it"
              description="Smart categories set up automatically. Use our categories or create your own."
              icon={
                <Badge variant="dark-gray" size="sm" icon={<AutoOrganize />}>
                  STEP 2
                </Badge>
              }
              centerContent
              className="h-full"
            >
              <div className="flex flex-col gap-2 scale-[110%]">
                <div className="flex gap-2">
                  <Badge variant="purple" icon={<Newsletter />}>
                    Newsletter
                  </Badge>
                  <Badge variant="dark-blue" icon={<Envelope />}>
                    To Reply
                  </Badge>
                  <Badge variant="green" icon={<Megaphone />}>
                    Marketing
                  </Badge>
                  <Badge variant="yellow" icon={<Calendar />}>
                    Calendar
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Badge variant="red" icon={<Bell />}>
                    Notification
                  </Badge>
                  <Badge variant="light-blue" icon={<SnowFlake />}>
                    Cold Email
                  </Badge>
                  <Badge variant="orange" icon={<Team />}>
                    Team
                  </Badge>
                  <Badge variant="pink" icon={<Fire />}>
                    Urgent
                  </Badge>
                </div>
              </div>
            </DisplayCard>
          </BlurFade>
          <BlurFade delay={0.25 * 2} inView>
            <DisplayCard
              title="Pre-drafted replies based on your email history and calendar"
              description="Every email you get needing a reply will have a pre-written draft."
              icon={
                <Badge variant="dark-gray" size="sm" icon={<SparkleBlue />}>
                  STEP 3
                </Badge>
              }
            >
              <div className="pt-6 pl-6">
                <Image
                  src="/images/new-landing/new-email.svg"
                  alt="Pre-drafted replies"
                  width={1000}
                  height={400}
                />
              </div>
            </DisplayCard>
          </BlurFade>
        </CardWrapper>
      </SectionContent>
    </Section>
  );
}
