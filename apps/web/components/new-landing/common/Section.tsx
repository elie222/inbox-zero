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
  childrenMarginTop?: string;
}

export function Section({
  title,
  subtitle,
  children,
  wrap,
  variant,
  childrenMarginTop,
}: SectionProps) {
  const titleStyles = cva("mx-auto", {
    variants: {
      wrap: {
        true: "max-w-[620px]",
      },
    },
  });

  const subtitleStyles = cva("max-w-[650px] mx-auto", {
    variants: {
      variant: {
        default: "mt-2",
        hero: "mt-4",
      },
    },
  });

  return (
    <section className="py-16 text-center">
      {variant === "hero" && title ? (
        <Heading className={titleStyles({ wrap })}>{title}</Heading>
      ) : title ? (
        <Subheading className={titleStyles({ wrap })}>{title}</Subheading>
      ) : null}
      {subtitle ? (
        <Paragraph className={subtitleStyles({ variant })}>
          {subtitle}
        </Paragraph>
      ) : null}
      <div
        className={cx(
          "flex justify-center",
          childrenMarginTop || "mt-6 md:mt-10",
        )}
      >
        {children}
      </div>
    </section>
  );
}
