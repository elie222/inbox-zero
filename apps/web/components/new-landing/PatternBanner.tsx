import { cn } from "@/utils";
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
  variant?: "full-width" | "card";
}

export function PatternBanner({
  title,
  subtitle,
  children,
  variant = "full-width",
}: PatternBannerProps) {
  return (
    <div
      className={cn(
        "bg-[url('/images/new-landing/buy-back-time-bg.png')] bg-cover bg-no-repeat overflow-hidden",
        variant === "card" ? "border border-[#E7E7E7A3] rounded-3xl my-10" : "",
      )}
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
