import {
  Heading,
  Paragraph,
  Subheading,
} from "@/components/new-landing/common/Typography";
import { cva, cx } from "class-variance-authority";

interface SectionProps {
  title?: string | React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
  wrap?: boolean;
  variant?: "default" | "hero";
  noGap?: boolean;
  className?: string;
}

export function Section({
  title,
  subtitle,
  children,
  wrap,
  variant = "default",
  noGap = false,
}: SectionProps) {
  const titleStyles = cva("mx-auto", {
    variants: {
      wrap: {
        true: "max-w-[620px]",
      },
    },
  });

  return (
    <section className="py-6 md:py-16 text-center">
      {variant === "hero" && title ? (
        <Heading className={titleStyles({ wrap })}>{title}</Heading>
      ) : title ? (
        <Subheading className={titleStyles({ wrap })}>{title}</Subheading>
      ) : null}
      {subtitle ? (
        <Paragraph
          className={cx(
            "max-w-[650px] mx-auto",
            variant === "hero" ? "mt-4" : "mt-2",
          )}
        >
          {subtitle}
        </Paragraph>
      ) : null}
      <div className={noGap ? "" : "mt-6 md:mt-10"}>{children}</div>
    </section>
  );
}
