import { CallToAction } from "@/components/new-landing/CallToAction";
import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import {
  SectionHeading,
  SectionSubtitle,
} from "@/components/new-landing/common/Typography";

export function FinalCTA() {
  return (
    <div
      className="bg-[url('/images/new-landing/buy-back-time-bg.png')] bg-cover bg-center bg-no-repeat"
      style={{ backgroundPosition: "center 44%" }}
    >
      <Section>
        <SectionHeading>
          Get back an hour a day.
          <br />
          Start using Inbox Zero.
        </SectionHeading>
        <SectionSubtitle>
          Less time in your inbox. More time for what actually matters.
        </SectionSubtitle>
        <SectionContent>
          <CallToAction
            text="Get started for free"
            buttonSize="lg"
            className="mt-6"
          />
        </SectionContent>
      </Section>
    </div>
  );
}
