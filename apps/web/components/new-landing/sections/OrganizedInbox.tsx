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
      <SectionHeading>
        Automatically organized.
        <br />
        Never miss an important email again.
      </SectionHeading>
      <SectionSubtitle>
        Drowning in emails? Don't waste energy trying to prioritize your emails.
        Our AI assistant will label everything automatically.
      </SectionSubtitle>
      <SectionContent className="flex justify-center">
        <Image
          className="hidden md:block"
          src="/images/new-landing/an-organized-inbox.png"
          alt="an organized inbox"
          width={1000}
          height={1000}
        />
        <Image
          className="block md:hidden"
          src="/images/new-landing/an-organized-inbox-mobile.png"
          alt="an organized inbox"
          width={1000}
          height={1000}
        />
      </SectionContent>
    </Section>
  );
}
