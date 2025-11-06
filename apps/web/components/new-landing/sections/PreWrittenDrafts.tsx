import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import {
  SectionHeading,
  SectionSubtitle,
} from "@/components/new-landing/common/Typography";
import Image from "next/image";

export function PreWrittenDrafts() {
  return (
    <Section>
      <SectionHeading>Pre-written drafts waiting in your inbox</SectionHeading>
      <SectionSubtitle>
        When you check your inbox, every email needing a response will have a
        pre-drafted reply in your tone, ready for you to send.
      </SectionSubtitle>
      <SectionContent className="flex justify-center">
        <Image
          className="hidden md:block"
          src="/images/new-landing/pre-written-drafts.svg"
          alt="pre-written drafts"
          width={1000}
          height={1000}
        />
        <Image
          className="block md:hidden"
          src="/images/new-landing/pre-written-drafts-mobile.svg"
          alt="an organized inbox"
          width={2000}
          height={2000}
        />
      </SectionContent>
    </Section>
  );
}
