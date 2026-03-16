import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import {
  SectionHeading,
  SectionSubtitle,
} from "@/components/new-landing/common/Typography";

interface PatternBannerProps {
  children?: React.ReactNode;
  subtitle: React.ReactNode;
  title: React.ReactNode;
}

export function PatternBanner({
  title,
  subtitle,
  children,
}: PatternBannerProps) {
  return (
    <div
      className="bg-[url('/images/new-landing/buy-back-time-bg.png')] bg-cover bg-center bg-no-repeat"
      style={{ backgroundPosition: "center 44%" }}
    >
      <Section>
        <SectionHeading>{title}</SectionHeading>
        <SectionSubtitle>{subtitle}</SectionSubtitle>
        {children ? <SectionContent>{children}</SectionContent> : null}
      </Section>
    </div>
  );
}
