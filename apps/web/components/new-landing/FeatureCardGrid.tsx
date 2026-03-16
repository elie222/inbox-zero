import { BlurFade } from "@/components/new-landing/common/BlurFade";
import { Card, CardContent } from "@/components/new-landing/common/Card";
import { CardWrapper } from "@/components/new-landing/common/CardWrapper";
import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import {
  Paragraph,
  SectionHeading,
  SectionSubtitle,
} from "@/components/new-landing/common/Typography";

interface FeatureItem {
  description: string;
  icon: React.ReactNode;
  title: React.ReactNode;
}

interface FeatureCardGridProps {
  heading: React.ReactNode;
  items: FeatureItem[];
  subtitle: React.ReactNode;
}

export function FeatureCardGrid({
  heading,
  subtitle,
  items,
}: FeatureCardGridProps) {
  return (
    <Section>
      <SectionHeading wrap>{heading}</SectionHeading>
      <SectionSubtitle>{subtitle}</SectionSubtitle>
      <SectionContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto px-4">
        <CardWrapper className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 col-span-full">
          {items.map((item, index) => (
            <BlurFade key={String(item.title)} delay={index * 0.1} inView>
              <Card variant="extra-rounding" className="h-full">
                <CardContent className="flex flex-col gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-b from-[#EBF0FE] to-[#D6E1FC] text-[#2965EC]">
                    {item.icon}
                  </div>
                  <h3 className="font-title text-lg leading-6">{item.title}</h3>
                  <Paragraph size="sm">{item.description}</Paragraph>
                </CardContent>
              </Card>
            </BlurFade>
          ))}
        </CardWrapper>
      </SectionContent>
    </Section>
  );
}
