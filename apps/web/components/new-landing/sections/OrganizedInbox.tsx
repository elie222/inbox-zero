import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import {
  SectionHeading,
  SectionSubtitle,
} from "@/components/new-landing/common/Typography";
import Image from "next/image";

interface OrganizedInboxProps {
  title: React.ReactNode;
  subtitle: React.ReactNode;
}

export function OrganizedInbox({ title, subtitle }: OrganizedInboxProps) {
  return (
    <Section>
      <SectionHeading>{title}</SectionHeading>
      <SectionSubtitle>{subtitle}</SectionSubtitle>
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
