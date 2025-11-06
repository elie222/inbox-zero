import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import {
  SectionHeading,
  SectionSubtitle,
} from "@/components/new-landing/common/Typography";
import Image from "next/image";

export function OrganizedInbox() {
  return (
    <Section>
      <SectionHeading wrap>
        An organized inbox so you never miss an important email
      </SectionHeading>
      <SectionSubtitle>
        Drowning in emails? Don't waste any more valuable brain energy trying to
        prioritize your emails. Our AI assistant will label everything
        automatically.
      </SectionSubtitle>
      <SectionContent className="flex justify-center">
        <Image
          className="hidden md:block"
          src="/images/new-landing/inbox-before-after.svg"
          alt="an organized inbox"
          width={1000}
          height={1000}
        />
        <Image
          className="block md:hidden"
          src="/images/new-landing/inbox-before-after-mobile.svg"
          alt="an organized inbox"
          width={1000}
          height={1000}
        />
      </SectionContent>
    </Section>
  );
}
