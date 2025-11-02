import { Heading, Subheading } from "@/app/(landing)/new-landing/Typography";
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
  return (
    <section className="py-16 text-center">
      {variant === "hero" ? (
        <Heading className={cn("mx-auto", wrap ? "max-w-[620px]" : "")}>
          {title}
        </Heading>
      ) : (
        <Subheading className={cn("mx-auto", wrap ? "max-w-[620px]" : "")}>
          {title}
        </Subheading>
      )}
      {subtitle ? (
        <p className="text-gray-500 max-w-[650px] mx-auto mt-4">{subtitle}</p>
      ) : null}
      <div className="mt-10 flex justify-center">{children}</div>
    </section>
  );
}
