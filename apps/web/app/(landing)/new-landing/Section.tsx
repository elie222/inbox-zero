import {
  Heading,
  Paragraph,
  Subheading,
} from "@/app/(landing)/new-landing/Typography";
import { cn } from "@/utils";

interface SectionProps {
  title: string | React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
  wrap?: boolean;
  variant?: "default" | "hero";
}

export function Section({
  title,
  subtitle,
  children,
  wrap,
  variant,
}: SectionProps) {
  const titleStyles = cn("mx-auto", wrap ? "max-w-[620px]" : "");

  return (
    <section className="py-16 text-center">
      {variant === "hero" ? (
        <Heading className={titleStyles}>{title}</Heading>
      ) : (
        <Subheading className={titleStyles}>{title}</Subheading>
      )}
      {subtitle ? (
        <Paragraph className="max-w-[650px] mx-auto mt-4">{subtitle}</Paragraph>
      ) : null}
      <div className="mt-10 flex justify-center">{children}</div>
    </section>
  );
}
