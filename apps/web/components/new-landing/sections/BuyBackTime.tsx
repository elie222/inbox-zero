import { CallToAction } from "@/components/new-landing/CallToAction";
import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import {
  SectionHeading,
  SectionSubtitle,
} from "@/components/new-landing/common/Typography";

export function BuyBackTime() {
  return (
    <div
      className="bg-[url('/images/new-landing/buy-back-time-bg.png')] bg-cover bg-center bg-no-repeat"
      style={{ backgroundPosition: "center 44%" }}
    >
      <Section>
        <SectionHeading>Buy back your time</SectionHeading>
        <SectionSubtitle>
          Stop wasting half your day on email. Start using Inbox Zero today.
        </SectionSubtitle>
        <SectionContent>
          <CallToAction text="Get started for free" className="mt-6" />
        </SectionContent>
      </Section>
    </div>
  );
}
