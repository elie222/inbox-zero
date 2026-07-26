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
  subtitle: React.ReactNode;
  title: React.ReactNode;
}

export function PreWrittenDrafts({ title, subtitle }: PreWrittenDraftsProps) {
  return (
    <Section>
      <SectionHeading>{title}</SectionHeading>
      <SectionSubtitle>{subtitle}</SectionSubtitle>
      <SectionContent className="flex justify-center">
        <Image
          className="hidden h-auto w-full md:block"
          src="/images/new-landing/pre-written-drafts.png"
          alt="pre-written drafts"
          width={1932}
          height={904}
          sizes="(min-width: 1280px) 1152px, (min-width: 1024px) calc(100vw - 64px), calc(100vw - 48px)"
        />
        <Image
          className="block h-auto w-full md:hidden"
          src="/images/new-landing/pre-written-drafts-mobile.png"
          alt="pre-written drafts"
          width={1311}
          height={2377}
          sizes="calc(100vw - 48px)"
        />
      </SectionContent>
    </Section>
  );
}
