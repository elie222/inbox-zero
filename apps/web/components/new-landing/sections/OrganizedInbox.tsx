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
  subtitle: React.ReactNode;
  title: React.ReactNode;
}

export function OrganizedInbox({ title, subtitle }: OrganizedInboxProps) {
  return (
    <Section>
      <SectionHeading>{title}</SectionHeading>
      <SectionSubtitle>{subtitle}</SectionSubtitle>
      <SectionContent className="flex justify-center">
        <Image
          className="hidden h-auto w-full md:block"
          src="/images/new-landing/an-organized-inbox.png"
          alt="an organized inbox"
          width={2120}
          height={1294}
          sizes="(min-width: 1280px) 1152px, (min-width: 1024px) calc(100vw - 64px), calc(100vw - 48px)"
        />
        <Image
          className="block h-auto w-full md:hidden"
          src="/images/new-landing/an-organized-inbox-mobile.png"
          alt="an organized inbox"
          width={1431}
          height={3301}
          sizes="calc(100vw - 48px)"
        />
      </SectionContent>
    </Section>
  );
}
