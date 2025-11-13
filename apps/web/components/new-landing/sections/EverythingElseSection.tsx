import { BlurFade } from "@/components/new-landing/common/BlurFade";
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
import { Analytics } from "@/components/new-landing/icons/Analytics";
import { ChatTwo } from "@/components/new-landing/icons/ChatTwo";
import { Link } from "@/components/new-landing/icons/Link";
import Image from "next/image";

export function EverythingElseSection() {
  return (
    <Section>
      <SectionHeading>Designed around how you actually work</SectionHeading>
      <SectionSubtitle>
        Flexible enough to fit any workflow. Simple enough to set up in minutes.
      </SectionSubtitle>
      <SectionContent
        noMarginTop
        className="mt-5 flex flex-col items-center gap-5"
      >
        <CardWrapper className="w-full grid grid-cols-1 md:grid-cols-3 gap-5">
          <BlurFade inView>
            <DisplayCard
              title="Email analytics. What gets measured, gets managed"
              description="See who emails you most and what's clogging your inbox. Get clear insights, then take action."
              icon={<Analytics />}
            >
              <Image
                src="/images/new-landing/metrics.svg"
                alt="metrics"
                width={1000}
                height={400}
              />
            </DisplayCard>
          </BlurFade>
          <BlurFade delay={0.25} inView>
            <DisplayCard
              title="Drafts that know your schedule and availability"
              description="Connects to your calendar and CRM to draft emails based on your actual schedule and customer data."
              icon={<Link />}
            >
              <Image
                src="/images/new-landing/integrations.svg"
                alt="App integrations"
                width={1000}
                height={400}
              />
            </DisplayCard>
          </BlurFade>
          <BlurFade delay={0.25 * 2} inView>
            <DisplayCard
              title="Built to fit your workflow. Customize in plain English"
              description="Your inbox, your rules. Configure everything in plain English. Make it work the way you actually work."
              icon={<ChatTwo />}
            >
              <Image
                src="/images/new-landing/create-rules.svg"
                alt="Customize"
                width={1000}
                height={400}
              />
            </DisplayCard>
          </BlurFade>
        </CardWrapper>
      </SectionContent>
    </Section>
  );
}
