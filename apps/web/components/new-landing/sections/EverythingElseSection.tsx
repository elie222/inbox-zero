import Image from "next/image";
import { Trans, useLingui } from "@lingui/react/macro";
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

export function EverythingElseSection() {
  const { t } = useLingui();

  return (
    <Section>
      <SectionHeading>
        <Trans>Designed around how you actually work</Trans>
      </SectionHeading>
      <SectionSubtitle>
        <Trans>
          Flexible enough to fit any workflow. Simple enough to set up in
          minutes.
        </Trans>
      </SectionSubtitle>
      <SectionContent
        noMarginTop
        className="mt-5 flex flex-col items-center gap-5 sm:mx-10 md:mx-40 lg:mx-0"
      >
        <CardWrapper className="w-full grid grid-cols-1 lg:grid-cols-3 gap-5">
          <BlurFade inView>
            <DisplayCard
              title={t`Email analytics. What gets measured, gets managed`}
              description={t`See who emails you most and what's clogging your inbox. Get clear insights, then take action.`}
              icon={<Analytics />}
            >
              <Image
                src="/images/new-landing/metrics.svg"
                alt={t`metrics`}
                width={1000}
                height={400}
              />
            </DisplayCard>
          </BlurFade>
          <BlurFade delay={0.25} inView>
            <DisplayCard
              title={t`Drafts that know your schedule and availability`}
              description={t`Connects to your calendar and CRM to draft emails based on your actual schedule and customer data.`}
              icon={<Link />}
            >
              <Image
                src="/images/new-landing/integrations.png"
                alt={t`App integrations`}
                width={1000}
                height={400}
              />
            </DisplayCard>
          </BlurFade>
          <BlurFade delay={0.25 * 2} inView>
            <DisplayCard
              title={t`Built to fit your workflow. Customize in plain English`}
              description={t`Your inbox, your rules. Configure everything in plain English. Make it work the way you actually work.`}
              icon={<ChatTwo />}
            >
              <Image
                src="/images/new-landing/create-rules.png"
                alt={t`Customize`}
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
