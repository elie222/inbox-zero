import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import {
  SectionHeading,
  SectionSubtitle,
} from "@/components/new-landing/common/Typography";
import Image from "next/image";

interface PreWrittenDraftsProps {
  title: React.ReactNode;
  subtitle: React.ReactNode;
}

export function PreWrittenDrafts({ title, subtitle }: PreWrittenDraftsProps) {
  return (
    <Section>
      <SectionHeading>{title}</SectionHeading>
      <SectionSubtitle>{subtitle}</SectionSubtitle>
      <SectionContent className="flex justify-center">
        <Image
          className="hidden md:block"
          src="/images/new-landing/pre-written-drafts.png"
          alt="pre-written drafts"
          width={2000}
          height={2000}
        />
        <Image
          className="block md:hidden"
          src="/images/new-landing/pre-written-drafts-mobile.png"
          alt="an organized inbox"
          width={2000}
          height={2000}
        />
      </SectionContent>
    </Section>
  );
}
